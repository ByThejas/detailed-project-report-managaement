import type { Measure, Page } from './layout';

/** The PDF's fonts, loaded once; their metrics also drive the preview so line breaks match. */
export async function loadFonts() {
  const pdf = await import('pdf-lib');
  const doc = await pdf.PDFDocument.create();
  const regular = await doc.embedFont(pdf.StandardFonts.Helvetica);
  const bold = await doc.embedFont(pdf.StandardFonts.HelveticaBold);
  const measure: Measure = (text, size, b) => (b ? bold : regular).widthOfTextAtSize(text, size);
  return measure;
}

/** Draws the laid-out pages into a PDF. */
export async function renderPdf(pages: Page[], title: string): Promise<Uint8Array> {
  const pdf = await import('pdf-lib');
  const doc = await pdf.PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('DPR Manager');
  const regular = await doc.embedFont(pdf.StandardFonts.Helvetica);
  const bold = await doc.embedFont(pdf.StandardFonts.HelveticaBold);
  const black = pdf.rgb(0, 0, 0);
  for (const p of pages) {
    const page = doc.addPage([p.w, p.h]);
    // Fills first so lines and text sit on top.
    for (const op of p.ops)
      if (op.kind === 'rect') page.drawRectangle({ x: op.x, y: p.h - op.y - op.h, width: op.w, height: op.h, color: pdf.rgb(op.grey, op.grey, op.grey) });
    for (const op of p.ops) {
      if (op.kind === 'line')
        page.drawLine({ start: { x: op.x1, y: p.h - op.y1 }, end: { x: op.x2, y: p.h - op.y2 }, thickness: op.width, color: black });
      else if (op.kind === 'text') page.drawText(op.text, { x: op.x, y: p.h - op.y, size: op.size, font: op.bold ? bold : regular, color: black });
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
