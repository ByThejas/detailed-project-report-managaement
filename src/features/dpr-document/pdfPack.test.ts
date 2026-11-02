import * as pdf from 'pdf-lib';
import { addFiles } from '@/features/documents/state';
import { EMPTY_DOCUMENTS } from '@/features/documents/types';
import { row } from '@/test/fixtures';
import { buildPdfPack } from './pdfPack';

async function onePagePdf(text: string) {
  const d = await pdf.PDFDocument.create();
  const p = d.addPage([300, 300]);
  p.drawText(text, { x: 20, y: 150, size: 12, font: await d.embedFont(pdf.StandardFonts.Helvetica) });
  return (await d.save()).buffer as ArrayBuffer;
}

// 1×1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)).buffer;

describe('print-ready PDF pack', () => {
  it('puts the DPR first, then each attached annexure behind a title page, and numbers every page', async () => {
    let docs = addFiles(EMPTY_DOCUMENTS, 'grid-map', [{ name: 'grid.png', size: 1, addedAt: '' }]);
    docs = addFiles(docs, 'tccm-proceedings', [{ name: 'tccm.pdf', size: 1, addedAt: '' }]);
    docs = addFiles(docs, 'bill-of-quantity-electrical', [{ name: 'boq.xlsx', size: 1, addedAt: '' }]);
    docs = addFiles(docs, 'earth-mat-design', [{ name: 'earthmat.pdf', size: 1, addedAt: '' }]);
    const files: Record<string, { type: string; bytes: ArrayBuffer }> = {
      'grid.png': { type: 'image/png', bytes: PNG },
      'tccm.pdf': { type: 'application/pdf', bytes: await onePagePdf('TCCM') },
      'boq.xlsx': { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: new ArrayBuffer(4) },
    };
    const r = await buildPdfPack(pdf, {
      dpr: row({ project: 'Additional 1×20 MVA at Thyavanige — ಕನ್ನಡ' }),
      documents: docs,
      front: await onePagePdf('DPR'),
      fileOf: async (_k, name) => (files[name] ? { name, ...files[name]! } : undefined),
    });
    // DPR 1 + (title + image) + (title + tccm) + title for 8 + title for 9 = 7.
    expect(r.pages).toBe(7);
    expect(r.included).toEqual(['grid.png', 'tccm.pdf']);
    expect(r.skipped.map((s) => s.name)).toEqual(['boq.xlsx', 'earthmat.pdf']);
    const back = await pdf.PDFDocument.load(r.bytes);
    expect(back.getPageCount()).toBe(7);
  });
});
