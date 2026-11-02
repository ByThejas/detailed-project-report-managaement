import type * as PdfLib from 'pdf-lib';
import type { DprDocuments } from '@/features/documents/types';
import type { DprRow } from '@/features/reports/types';
import { ANNEXURES } from './buildDocx';

/** A stored attachment, as the pack needs it. */
export interface PackFile {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export interface PackInput {
  dpr: DprRow;
  documents: DprDocuments;
  /** Looks up an attached file's bytes; undefined when this browser doesn't have it. */
  fileOf: (docKey: string, name: string) => Promise<PackFile | undefined>;
  /** The Word DPR saved as PDF, to go in front. Optional. */
  front?: ArrayBuffer;
  runningTitle?: string;
}

export interface PackResult {
  bytes: Uint8Array;
  pages: number;
  /** Annexure files put in the pack. */
  included: string[];
  /** Files left out, with why. */
  skipped: { name: string; why: string }[];
}

/** Standard PDF fonts only cover Latin-1 and a few marks; anything else becomes '?'. */
const safe = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '?');

const A4: [number, number] = [595.28, 841.89];
const kindOf = (f: { name: string; type: string }) => {
  const n = f.name.toLowerCase();
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (f.type === 'image/png' || n.endsWith('.png')) return 'png';
  if (/image\/jpe?g/.test(f.type) || /\.jpe?g$/.test(n)) return 'jpg';
  return 'other';
};

/** The annexures that are attached files (5, 7, 8 and 9), in order. */
export const ATTACHED_ANNEXURES = ANNEXURES.filter((a) => !a.generated);

/**
 * Builds one print-ready PDF: the DPR (if its PDF is given), then each attached annexure behind a title
 * page, with page numbers stamped on every page. PDFs and PNG/JPEG images go in as they are; other
 * files (e.g. the BOQ workbook) are named on the title page as not included.
 */
export async function buildPdfPack(pdf: typeof PdfLib, input: PackInput): Promise<PackResult> {
  const { PDFDocument, StandardFonts, rgb } = pdf;
  const out = await PDFDocument.create();
  out.setTitle(`DPR ${input.dpr.id}`);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const included: string[] = [];
  const skipped: { name: string; why: string }[] = [];

  if (input.front) {
    const src = await PDFDocument.load(input.front, { ignoreEncryption: true });
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }

  for (const a of ATTACHED_ANNEXURES) {
    const files = a.docs.flatMap((k) => (input.documents.files[k] ?? []).map((f) => ({ key: k, name: f.name })));
    const title = out.addPage(A4);
    const centre = (raw: string, y: number, size: number, f = bold) => {
      const text = safe(raw);
      title.drawText(text, { x: (A4[0] - f.widthOfTextAtSize(text, size)) / 2, y, size, font: f });
    };
    centre(`ANNEXURE-${a.no}`, 520, 22);
    centre(a.title.toUpperCase(), 488, 16);
    const notes: string[] = [];
    if (!files.length) notes.push('Not attached.');
    for (const f of files) {
      const stored = await input.fileOf(f.key, f.name);
      if (!stored) {
        skipped.push({ name: f.name, why: 'not stored in this browser; attach it again in Documents' });
        notes.push(`${f.name}: not in this browser`);
        continue;
      }
      const kind = kindOf(stored);
      try {
        if (kind === 'pdf') {
          const src = await PDFDocument.load(stored.bytes, { ignoreEncryption: true });
          for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        } else if (kind === 'png' || kind === 'jpg') {
          const img = kind === 'png' ? await out.embedPng(stored.bytes) : await out.embedJpg(stored.bytes);
          const landscape = img.width > img.height;
          const size: [number, number] = landscape ? [A4[1], A4[0]] : A4;
          const page = out.addPage(size);
          const s = Math.min((size[0] - 60) / img.width, (size[1] - 80) / img.height, 1);
          page.drawImage(img, { x: (size[0] - img.width * s) / 2, y: (size[1] - img.height * s) / 2 + 10, width: img.width * s, height: img.height * s });
        } else {
          skipped.push({ name: f.name, why: 'not a PDF or image; save it as PDF and attach that' });
          notes.push(`${f.name}: not included (save as PDF to include it)`);
          continue;
        }
        included.push(f.name);
      } catch {
        skipped.push({ name: f.name, why: 'could not be read (damaged or protected file)' });
        notes.push(`${f.name}: could not be read`);
      }
    }
    notes.forEach((n, i) => centre(n, 440 - i * 16, 10, font));
  }

  const total = out.getPageCount();
  const footer = input.runningTitle ?? input.dpr.project;
  out.getPages().forEach((p, i) => {
    const { width } = p.getSize();
    const label = `Page ${i + 1} of ${total}`;
    p.drawText(label, { x: width - 36 - font.widthOfTextAtSize(label, 8), y: 18, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
    const left = safe(`${input.dpr.id} · ${footer}`).slice(0, 110);
    p.drawText(left, { x: 36, y: 18, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  });

  return { bytes: await out.save(), pages: total, included, skipped };
}

export async function downloadPdfPack(input: PackInput): Promise<PackResult> {
  const pdf = await import('pdf-lib');
  const r = await buildPdfPack(pdf, input);
  const url = URL.createObjectURL(new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `DPR_${input.dpr.id.replace(/\W+/g, '-')}_print-pack.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return r;
}
