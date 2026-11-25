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
  /**
   * The DPR's own pages saved as PDF from the print tab (cover, text pages, PERT chart, BCR). A Word DPR
   * saved as PDF also works; it then goes in front as it is.
   */
  front?: ArrayBuffer;
  /** The abstract and estimate PDF (annexure 3). */
  estimates?: ArrayBuffer;
  /** The estimate workbook's other sheets, when the estimate PDF was supplied as a file: they follow it, before the PERT chart. */
  estimateExtras?: ArrayBuffer;
  /** Whether the printed DPR ends with the two BCR pages (not for pure line works). */
  hasBcr?: boolean;
}

export interface PackResult {
  bytes: Uint8Array;
  pages: number;
  /** Annexure files put in the pack. */
  included: string[];
  /** Files left out, with why. */
  skipped: { name: string; why: string }[];
  /** False when the DPR PDF wasn't the print-tab one, so it went in front unsplit. */
  ordered: boolean;
}

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
 * Where the parts of the printed DPR are: page 1 is the A4 cover, then the Letter text pages, then the
 * landscape PERT chart and (unless exempt) the two landscape BCR pages. Null when the PDF isn't laid out so.
 */
export function splitPrinted(sizes: { width: number; height: number }[], hasBcr: boolean): { cover: number[]; text: number[]; pert: number[]; bcr: number[] } | null {
  const tail = hasBcr ? 3 : 1;
  const n = sizes.length;
  if (n < tail + 2) return null;
  const landscape = (i: number) => sizes[i]!.width > sizes[i]!.height;
  const ends = Array.from({ length: tail }, (_, k) => n - tail + k);
  if (!ends.every(landscape) || landscape(0) || landscape(n - tail - 1)) return null;
  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);
  return { cover: [0], text: range(1, n - tail), pert: [n - tail], bcr: hasBcr ? [n - 2, n - 1] : [] };
}

/**
 * Builds the final DPR as one PDF in the Thyavanige DPR's order: cover, contents and report pages,
 * the abstract and estimates (3) with the estimate workbook's other sheets after them, PERT chart (4), grid map (5), BCR (6), TCCM extract (7), layout and BOM
 * (8) and the R&D earthmat report (9). Like the Thyavanige PDF it has no separator pages and no page
 * stamps. PDFs and PNG/JPEG images go in as they are; other files are listed as left out.
 */
export async function buildPdfPack(pdf: typeof PdfLib, input: PackInput): Promise<PackResult> {
  const { PDFDocument } = pdf;
  const out = await PDFDocument.create();
  out.setTitle(`DPR ${input.dpr.id}: ${input.dpr.project}`);
  out.setCreator('DPR Manager');
  const included: string[] = [];
  const skipped: { name: string; why: string }[] = [];

  const front = input.front ? await PDFDocument.load(input.front, { ignoreEncryption: true }) : null;
  const parts = front ? splitPrinted(front.getPages().map((p) => p.getSize()), input.hasBcr ?? true) : null;
  const copy = async (src: PdfLib.PDFDocument, pages: number[]) => {
    for (const p of await out.copyPages(src, pages)) out.addPage(p);
  };

  const attach = async (no: string) => {
    const a = ATTACHED_ANNEXURES.find((x) => x.no === no);
    if (!a) return;
    const files = a.docs.flatMap((k) => (input.documents.files[k] ?? []).map((f) => ({ key: k, name: f.name })));
    for (const f of files) {
      const stored = await input.fileOf(f.key, f.name);
      if (!stored) {
        skipped.push({ name: f.name, why: 'not stored in this browser; attach it again in Documents' });
        continue;
      }
      const kind = kindOf(stored);
      try {
        if (kind === 'pdf') {
          const src = await PDFDocument.load(stored.bytes, { ignoreEncryption: true });
          await copy(src, src.getPageIndices());
        } else if (kind === 'png' || kind === 'jpg') {
          const img = kind === 'png' ? await out.embedPng(stored.bytes) : await out.embedJpg(stored.bytes);
          const size: [number, number] = img.width > img.height ? [A4[1], A4[0]] : A4;
          const page = out.addPage(size);
          const s = Math.min((size[0] - 40) / img.width, (size[1] - 40) / img.height, 1);
          page.drawImage(img, { x: (size[0] - img.width * s) / 2, y: (size[1] - img.height * s) / 2, width: img.width * s, height: img.height * s });
        } else {
          skipped.push({ name: f.name, why: 'not a PDF or image; save it as PDF and attach that' });
          continue;
        }
        included.push(f.name);
      } catch {
        skipped.push({ name: f.name, why: 'could not be read (damaged or protected file)' });
      }
    }
  };

  if (front && parts) await copy(front, [...parts.cover, ...parts.text]);
  else if (front) await copy(front, front.getPageIndices());
  if (input.estimates) {
    const est = await PDFDocument.load(input.estimates, { ignoreEncryption: true });
    await copy(est, est.getPageIndices());
  }
  if (input.estimateExtras) {
    const more = await PDFDocument.load(input.estimateExtras, { ignoreEncryption: true });
    await copy(more, more.getPageIndices());
  }
  if (front && parts) await copy(front, parts.pert);
  await attach('5');
  if (front && parts) await copy(front, parts.bcr);
  for (const no of ['7', '8', '9']) await attach(no);

  return { bytes: await out.save(), pages: out.getPageCount(), included, skipped, ordered: !!parts };
}

export async function downloadPdfPack(input: PackInput): Promise<PackResult> {
  const pdf = await import('pdf-lib');
  const r = await buildPdfPack(pdf, input);
  const url = URL.createObjectURL(new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `DPR_${input.dpr.id.replace(/\W+/g, '-')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return r;
}
