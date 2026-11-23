import type { PDFDocument, PDFFont } from 'pdf-lib';
import type { Measure, Page } from './layout';

/**
 * The PDF is set in URW Bookman (Light and Demi), which has the same character widths as the Bookman Old Style
 * KPTCL prints its estimates in, so lines break where theirs do. Served from public/fonts.
 */
export interface FontBytes {
  regular: ArrayBuffer | Uint8Array;
  bold: ArrayBuffer | Uint8Array;
}

export const FONT_FILES = { regular: 'fonts/URWBookman-Light.ttf', bold: 'fonts/URWBookman-Demi.ttf' };
/** The family the preview uses, loaded from the same files. */
export const PREVIEW_FONT = 'DPR Bookman';

let pending: Promise<FontBytes | null> | null = null;

/** Fetches the font files once; null when they cannot be had (the PDF then falls back to Helvetica). */
export function fontBytes(): Promise<FontBytes | null> {
  pending ??= (async () => {
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const get = async (f: string) => {
        const r = await fetch(`${base}${f}`);
        if (!r.ok) throw new Error(f);
        return r.arrayBuffer();
      };
      const [regular, bold] = await Promise.all([get(FONT_FILES.regular), get(FONT_FILES.bold)]);
      return { regular, bold };
    } catch {
      pending = null;
      return null;
    }
  })();
  return pending;
}

/** For tests and callers that already hold the files. */
export function setFontBytes(bytes: FontBytes) {
  pending = Promise.resolve(bytes);
}

async function embedFonts(doc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  const pdf = await import('pdf-lib');
  const bytes = await fontBytes();
  if (bytes) {
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    doc.registerFontkit(fontkit);
    return { regular: await doc.embedFont(bytes.regular, { subset: true }), bold: await doc.embedFont(bytes.bold, { subset: true }) };
  }
  return { regular: await doc.embedFont(pdf.StandardFonts.Helvetica), bold: await doc.embedFont(pdf.StandardFonts.HelveticaBold) };
}

/** The PDF's fonts, loaded once; their metrics also drive the preview so line breaks match. */
export async function loadFonts() {
  const pdf = await import('pdf-lib');
  const doc = await pdf.PDFDocument.create();
  const { regular, bold } = await embedFonts(doc);
  const measure: Measure = (text, size, b) => (b ? bold : regular).widthOfTextAtSize(text, size);
  return measure;
}

/** Draws the laid-out pages into a PDF. */
export async function renderPdf(pages: Page[], title: string): Promise<Uint8Array> {
  const pdf = await import('pdf-lib');
  const doc = await pdf.PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('DPR Manager');
  const { regular, bold } = await embedFonts(doc);
  const black = pdf.rgb(0, 0, 0);
  for (const p of pages) {
    const page = doc.addPage([p.w, p.h]);
    // Fills first so lines and text sit on top.
    for (const op of p.ops)
      if (op.kind === 'rect') page.drawRectangle({ x: op.x, y: p.h - op.y - op.h, width: op.w, height: op.h, color: pdf.rgb(op.grey, op.grey, op.grey) });
    for (const op of p.ops) {
      // Lines are drawn as thin filled boxes, as Excel prints its borders, so they meet cleanly at the corners.
      if (op.kind === 'line') {
        const half = op.width / 2;
        const x = Math.min(op.x1, op.x2) - half;
        const y = p.h - Math.max(op.y1, op.y2) - half;
        page.drawRectangle({ x, y, width: Math.abs(op.x2 - op.x1) + op.width, height: Math.abs(op.y2 - op.y1) + op.width, color: black });
      } else if (op.kind === 'text') page.drawText(op.text, { x: op.x, y: p.h - op.y, size: op.size, font: op.bold ? bold : regular, color: black });
    }
  }
  return doc.save();
}

export async function downloadPdf(pages: Page[], fileName: string, title: string) {
  const bytes = await renderPdf(pages, title);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
