import * as pdf from 'pdf-lib';
import { row } from '@/test/fixtures';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import { buildTemplate } from '@/features/preparation/template';
import type { Estimate, EstimateLine, EstimateSection } from '@/features/preparation/types';
import { DEFAULT_PDF_SETTINGS, withDefaults } from './format';
import { approxMeasure, layout, pageKey, wrap } from './layout';
import { renderPdf } from './renderPdf';
import { printable, sheetsFromWorkbook } from './sheets';

const dpr = row({ voltage: '66 kV', capacity: '2x20 MVA', stream: 'Brownfield' });
const line = (section: EstimateSection, i: number, qty: number, s: number, er = 0): EstimateLine => ({
  id: `${section}-${i}`, section, code: `${section[0]}${i}`, description: `${section} item ${i}`, unit: 'No', qty, supplyRate: s, erectionRate: er, testingRate: 0,
});

function estimate(extra: EstimateLine[] = []): Estimate {
  return {
    ...buildTemplate(dpr),
    lines: [line('electrical', 1, 2, 1_250_000.5, 15_000), line('electrical', 2, 0, 999), line('civil', 1, 120.5, 4_321.09), line('dismantling', 1, 3, 15_000), ...extra],
    misc: {},
  } as Estimate;
}

async function sheetsOf(e: Estimate) {
  return sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e));
}

describe('Abstract & Estimate PDF', () => {
  it('takes only the abstract and estimate sheets of the Excel, general abstract first', async () => {
    const sheets = await sheetsOf(estimate());
    expect(sheets.map((s) => s.key)).toEqual(['General Abstract', 'Abstract-I', 'Part A Electrical', 'Part B Civil', 'Abstract-II', 'Dismantling']);
  });

  it('keeps the Excel rules: no zero-quantity items, zero amounts blank, Indian grouping', async () => {
    const partA = (await sheetsOf(estimate())).find((s) => s.key === 'Part A Electrical')!;
    expect(partA.rows.map((r) => r.cells[0]).filter(Boolean)).toEqual(['e1']);
    const item = partA.rows[0]!.cells;
    expect(item[5]).toBe('25,00,001.00');
    // T&C rate and amount are zero, so they print blank.
    expect(item[8]).toBe('');
    expect(item[9]).toBe('');
    expect(partA.columns[5]!.align).toBe('right');
    expect(partA.rows.at(-1)!.bold).toBe(true);
  });

  it('pages long sheets, repeats the headings and numbers every page', async () => {
    const many = Array.from({ length: 120 }, (_, i) => line('electrical', i + 10, 1, 100));
    const pages = layout(await sheetsOf(estimate(many)), DEFAULT_PDF_SETTINGS, approxMeasure);
    const partA = pages.filter((p) => p.sheet === 'Part A Electrical');
    expect(partA.length).toBeGreaterThan(1);
    for (const p of partA) expect(p.table!.rows[0]!.index).toBe(-1);
    expect(pages.at(-1)!.ops.some((o) => o.kind === 'text' && o.text === `Page ${pages.length} of ${pages.length}`)).toBe(true);
  });

  it('applies the editor settings: hidden sheets, row heights, column widths and borders', async () => {
    const sheets = await sheetsOf(estimate());
    const s = withDefaults({
      borders: 'none',
      sheets: { 'Part A Electrical': { include: false }, 'Abstract-I': { rowHeights: { '0': 40 }, colWeights: [1, 1, 2] } },
    });
    const pages = layout(sheets, s, approxMeasure);
    expect(pages.some((p) => p.sheet === 'Part A Electrical')).toBe(false);
    const abs = pages.find((p) => p.sheet === 'Abstract-I')!;
    expect(abs.table!.rows.find((r) => r.index === 0)!.h).toBe(40);
    const xs = abs.table!.xs;
    expect(xs[3]! - xs[2]!).toBeCloseTo(2 * (xs[1]! - xs[0]!));
    expect(abs.ops.some((o) => o.kind === 'line')).toBe(false);
  });

  it('prints edited text in place of the Excel text', async () => {
    const sheets = await sheetsOf(estimate());
    const s = withDefaults({ sheets: { 'Abstract-I': { cells: { '0:1': 'Cost of materials', '-1:2': 'Rs. lakhs' }, note: 'Kogali S/S', title: 'ABSTRACT - I' } } });
    const texts = layout(sheets, s, approxMeasure)
      .filter((p) => p.sheet === 'Abstract-I')
      .flatMap((p) => p.ops.flatMap((o) => (o.kind === 'text' ? [o.text] : [])));
    expect(texts).toEqual(expect.arrayContaining(['Cost of materials', 'Rs. lakhs', 'Kogali S/S', 'ABSTRACT - I']));
    expect(texts).not.toContain('Material cost');
  });

  it('rearranges sheets and pages, and numbers pages in the new order', async () => {
    const sheets = await sheetsOf(estimate());
    const bySheet = layout(sheets, withDefaults({ sheetOrder: ['Part B Civil', 'General Abstract'] }), approxMeasure);
    expect(bySheet.slice(0, 2).map((p) => p.sheet)).toEqual(['Part B Civil', 'General Abstract']);
    const natural = layout(sheets, DEFAULT_PDF_SETTINGS, approxMeasure).map(pageKey);
    const order = [natural[2]!, ...natural.filter((_, i) => i !== 2)];
    const moved = layout(sheets, withDefaults({ pageOrder: order }), approxMeasure);
    expect(moved.map(pageKey)).toEqual(order);
    expect(moved[0]!.ops.some((o) => o.kind === 'text' && o.text === `Page 1 of ${moved.length}`)).toBe(true);
    // A page the saved order does not know (the sheet grew) stays after the page before it.
    const shorter = layout(sheets, withDefaults({ pageOrder: order.filter((k) => k !== natural[4]) }), approxMeasure).map(pageKey);
    expect(shorter.indexOf(natural[4]!)).toBe(shorter.indexOf(natural[3]!) + 1);
  });

  it('wraps long descriptions inside the column', () => {
    const lines = wrap('Supply of 66 kV SF6 circuit breaker with all accessories', 80, 8, false, approxMeasure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(approxMeasure(l, 8, false)).toBeLessThanOrEqual(80);
  });

  it('writes a PDF with one page per laid-out page', async () => {
    const pages = layout(await sheetsOf(estimate()), DEFAULT_PDF_SETTINGS, approxMeasure);
    const bytes = await renderPdf(pages, 'test');
    const doc = await pdf.PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pages.length);
  });

  it('replaces characters the PDF fonts cannot print', () => {
    expect(printable('₹ 5 ≥ 2 – ok × é 中')).toBe('Rs. 5 >= 2 – ok × é ?');
  });
});
