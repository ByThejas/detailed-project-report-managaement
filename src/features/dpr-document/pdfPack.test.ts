import * as pdf from 'pdf-lib';
import { addFiles } from '@/features/documents/state';
import { EMPTY_DOCUMENTS } from '@/features/documents/types';
import { row } from '@/test/fixtures';
import { buildPdfPack, splitPrinted } from './pdfPack';

const A4P: [number, number] = [595, 842];
const A4L: [number, number] = [842, 595];
const LETTER: [number, number] = [612, 792];

/** A PDF whose pages carry the given labels, for checking the order. */
async function pagesPdf(pages: [string, [number, number]][]) {
  const d = await pdf.PDFDocument.create();
  const font = await d.embedFont(pdf.StandardFonts.Helvetica);
  for (const [text, size] of pages) d.addPage(size).drawText(text, { x: 20, y: 150, size: 12, font });
  return (await d.save()).buffer as ArrayBuffer;
}

// 1×1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)).buffer;

describe('final DPR', () => {
  it('finds the cover, text pages, PERT and BCR in the printed DPR', () => {
    const sizes = [A4P, LETTER, LETTER, LETTER, A4L, A4L, A4L].map(([width, height]) => ({ width, height }));
    expect(splitPrinted(sizes, true)).toEqual({ cover: [0], text: [1, 2, 3], pert: [4], bcr: [5, 6] });
    expect(splitPrinted(sizes.slice(0, 5), false)).toEqual({ cover: [0], text: [1, 2, 3], pert: [4], bcr: [] });
    expect(splitPrinted([LETTER, LETTER].map(([width, height]) => ({ width, height })), true)).toBeNull();
  });

  it('puts every part in the Thyavanige order, with no separator pages', async () => {
    let docs = addFiles(EMPTY_DOCUMENTS, 'grid-map', [{ name: 'grid.png', size: 1, addedAt: '' }]);
    docs = addFiles(docs, 'tccm-proceedings', [{ name: 'tccm.pdf', size: 1, addedAt: '' }]);
    docs = addFiles(docs, 'bill-of-quantity-electrical', [{ name: 'boq.xlsx', size: 1, addedAt: '' }]);
    docs = addFiles(docs, 'earth-mat-design', [{ name: 'earthmat.pdf', size: 1, addedAt: '' }]);
    const files: Record<string, { type: string; bytes: ArrayBuffer }> = {
      'grid.png': { type: 'image/png', bytes: PNG },
      'tccm.pdf': { type: 'application/pdf', bytes: await pagesPdf([['TCCM', A4P]]) },
      'boq.xlsx': { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: new ArrayBuffer(4) },
    };
    const r = await buildPdfPack(pdf, {
      dpr: row({ project: 'Additional 1×20 MVA at Thyavanige — ಕನ್ನಡ' }),
      documents: docs,
      front: await pagesPdf([['COVER', A4P], ['TEXT1', LETTER], ['TEXT2', LETTER], ['PERT', A4L], ['BCR1', A4L], ['BCR2', A4L]]),
      estimates: await pagesPdf([['EST1', A4L], ['EST2', A4L]]),
      hasBcr: true,
      fileOf: async (_k, name) => (files[name] ? { name, ...files[name]! } : undefined),
    });
    expect(r.ordered).toBe(true);
    // cover, 2 text, 2 estimate, PERT, grid image, 2 BCR, TCCM = 10.
    expect(r.pages).toBe(10);
    const back = await pdf.PDFDocument.load(r.bytes);
    expect(back.getPages().map((p) => Math.round(p.getWidth()))).toEqual([595, 612, 612, 842, 842, 842, 595, 842, 842, 595]);
    expect(r.included).toEqual(['grid.png', 'tccm.pdf']);
    expect(r.skipped.map((s) => s.name)).toEqual(['boq.xlsx', 'earthmat.pdf']);
  });

  it('puts a Word DPR saved as PDF in front as it is', async () => {
    const r = await buildPdfPack(pdf, { dpr: row(), documents: EMPTY_DOCUMENTS, front: await pagesPdf([['DPR', A4P]]), fileOf: async () => undefined });
    expect(r.ordered).toBe(false);
    expect(r.pages).toBe(1);
  });
});
