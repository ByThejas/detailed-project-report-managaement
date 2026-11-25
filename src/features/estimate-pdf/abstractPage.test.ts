import { readFileSync } from 'node:fs';
import { row } from '@/test/fixtures';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import { TEMPLATE_SOURCE, buildTemplate } from '@/features/preparation/template';
import type { Estimate, EstimateLine } from '@/features/preparation/types';
import { dropPresets } from '@/features/boq-import/toEstimateLine';
import { abstractHeadings } from '@/features/boq-import/parse';
import type { BoqReadResult } from '@/features/boq-import/types';
import { withDefaults } from './format';
import { layout } from './layout';
import { loadFonts, setFontBytes } from './renderPdf';
import { sheetsFromWorkbook } from './sheets';

const font = (f: string) => new Uint8Array(readFileSync(`public/fonts/${f}`));
setFontBytes({ regular: font('URWBookman-Light.ttf'), bold: font('URWBookman-Demi.ttf') });

const dpr = row({ voltage: '66 kV', capacity: '2x20 MVA', stream: 'Brownfield' });
const fileLine = (section: EstimateLine['section'], i: number, qty: number, rate: number): EstimateLine => ({
  id: `${section}-${i}`, section, code: `${i}`, description: `item ${i}`, unit: 'No', qty, supplyRate: rate, erectionRate: 0, testingRate: 0,
  source: `Jkote.xlsx · Line Supply row ${10 + i}`,
});

const read = {
  fileName: 'Jkote.xlsx', section: 'line', readAt: '', sheets: [], items: [], skipped: [], totals: [], misc: [],
  abstracts: [{
    sheet: 'ABSTRACT', part: 'line', title: 'KARNATAKA POWER TRANSMISSION CORPORATION LIMITED · Estimate for Conversion of 66kv S/C tapped line (Coyote) into LILO · ABSTRACT · Sl. No. · Particulars · Amount in Rs. (Lakhs)',
    basic: 100, total: 200, statutory: 500_000, areaLoadingPct: 3, gstPct: 18,
    labels: { labour: 'Labour/Erection/Dismantling charges and Testing & Commissioning Charges' },
  }],
} as unknown as BoqReadResult;

describe('KPTCL abstract page', () => {
  it('takes the estimate name and sheet title from the abstract’s title rows', () => {
    expect(abstractHeadings(['KARNATAKA POWER TRANSMISSION CORPORATION LIMITED', 'Estimate for Conversion of  66kv S/C tapped line', 'ABSTRACT', 'Sl. No.', 'Particulars '])).toEqual({
      heading: 'Estimate for Conversion of  66kv S/C tapped line',
      sheetTitle: 'ABSTRACT',
    });
  });

  it('prints the 11 KPTCL rows in the file’s wording, numbered 1 to 11, amounts as 0.00', async () => {
    const e = { ...buildTemplate(dpr), lines: [fileLine('line', 1, 2, 7_000_000)], lineCharges: { statutory: 500_000, forestCompensation: 0, landCompensation: 0 }, areaLoadingPct: 3 } as Estimate;
    const abs = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e, [read])).find((s) => s.key === 'Line Abstract')!;
    expect(abs.title).toBe('ABSTRACT');
    expect(abs.notes[0]).toBe('Estimate for Conversion of 66kv S/C tapped line (Coyote) into LILO');
    expect(abs.columns.map((c) => c.header)).toEqual(['Sl. No.', 'Particulars', 'Amount in Rs.\n(Lakhs)']);
    expect(abs.rows.map((r) => r.cells[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(abs.rows[1]!.cells[1]).toBe('Labour/Erection/Dismantling charges and Testing & Commissioning Charges');
    expect(abs.rows[6]!.cells[1]).toBe('Cost of the Estimate (Sum of Sl No. 4 to 6)\nAmount put to Tender');
    expect(abs.rows[0]!.cells[2]).toBe('140.00');
    expect(abs.rows.map((r) => r.bold)).toEqual([false, false, false, true, false, false, true, false, false, false, true]);
    // 140 + 3% = 144.2, GST 25.956, tender 170.156, + statutory 5 = 175.156; over 1,000 lakhs there would be no grouping either.
    expect(abs.rows[10]!.cells[2]).toBe('175.16');
  });

  it('lays the abstract out with a medium outer frame, thin lines inside and KPTCL’s column proportions', async () => {
    const e = { ...buildTemplate(dpr), lines: [fileLine('line', 1, 2, 7_000_000)] } as Estimate;
    const abs = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e, [read])).filter((s) => s.key === 'Line Abstract');
    const [page] = layout(abs, withDefaults({}), await loadFonts());
    const widths = page!.ops.filter((o) => o.kind === 'line').map((o) => (o as { width: number }).width);
    expect(Math.max(...widths)).toBeCloseTo(0.96, 2);
    expect(Math.min(...widths)).toBeCloseTo(0.48, 2);
    const xs = page!.table!.xs;
    const w = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(w[0]! / w[1]!).toBeCloseTo(50.5 / 496.6, 3);
    // Rows of one line are 26.3 pt at Excel's 100%, two lines 41.6 pt.
    const rows = page!.table!.rows.filter((r) => r.index >= 0);
    expect(rows[6]!.h / rows[0]!.h).toBeCloseTo(41.6 / 26.3, 2);
  });

  it('drops the sample template’s items and statutory charge once an estimate comes from a file', () => {
    const t = buildTemplate(dpr);
    expect(t.lines.some((l) => l.source === TEMPLATE_SOURCE)).toBe(true);
    const e = { ...t, lines: [...t.lines, fileLine('line', 1, 1, 100)] };
    const out = dropPresets(e, [read]);
    expect(out.lines.map((l) => l.id)).toEqual(['line-1']);
    expect(out.statutoryCharges).toBe(0);
    expect(out.areaLoadingPct).toBe(3);
    // Without file lines the sample stays (a DPR still being drafted from it).
    expect(dropPresets(t, [read])).toBe(t);
  });

  it('prints no signature block under the abstracts', async () => {
    const e = { ...buildTemplate(dpr), lines: [fileLine('line', 1, 2, 7_000_000)] } as Estimate;
    const abs = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e, [read])).filter((s) => s.key === 'Line Abstract');
    const pages = layout(abs, withDefaults({ signatures: ['Assistant Engineer'] } as never), await loadFonts());
    const words = pages.flatMap((p) => p.ops.filter((o) => o.kind === 'text').map((o) => (o as { text: string }).text));
    expect(words.some((t) => /^(Assistant|Executive)$/.test(t) || /Assistant Engineer|Executive Engineer/.test(t))).toBe(false);
  });

  it('keeps an edit on one page to that page', async () => {
    const lines = Array.from({ length: 120 }, (_, i) => ({ ...fileLine('line', i + 1, 1, 1000), id: `l${i}` }));
    const e = { ...buildTemplate(dpr), lines } as Estimate;
    const sheets = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e, [read]));
    const measure = await loadFonts();
    const before = layout(sheets, withDefaults({}), measure);
    const supply = before.filter((p) => p.sheet === 'Line Supply');
    expect(supply.length).toBeGreaterThan(1);
    const after = layout(sheets, withDefaults({ pages: { 'Line Supply#2': { bodySize: 9, innerLine: 1.5 } }, sheets: { 'Line Supply': { pageColWeights: { '2': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } } } }), measure);
    const ops = (p: { ops: unknown[] }) => JSON.stringify(p.ops);
    // Every other sheet's pages, and the pages before it, are drawn exactly as before. (Rows that page 2 no longer
    // holds move on to page 3, as text does, but page 3 keeps its own sizes and lines.)
    for (const p of before.filter((x) => x.sheet !== 'Line Supply' || x.sheetPage === 1))
      expect(ops(after.find((x) => x.sheet === p.sheet && x.sheetPage === p.sheetPage)!)).toBe(ops(p));
    const p3 = after.find((x) => x.sheet === 'Line Supply' && x.sheetPage === 3);
    if (p3) expect(p3.ops.some((o) => o.kind === 'text' && (o as { size: number }).size === 9)).toBe(false);
    const p2 = after.find((x) => x.sheet === 'Line Supply' && x.sheetPage === 2)!;
    expect(p2.ops.some((o) => o.kind === 'text' && (o as { size: number }).size === 9)).toBe(true);
  });
});
