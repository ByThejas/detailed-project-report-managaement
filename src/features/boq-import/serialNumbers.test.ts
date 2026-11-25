import { readFileSync } from 'node:fs';
import { row } from '@/test/fixtures';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import { buildTemplate } from '@/features/preparation/template';
import type { Estimate } from '@/features/preparation/types';
import { setFontBytes } from '@/features/estimate-pdf/renderPdf';
import { sheetsFromWorkbook } from '@/features/estimate-pdf/sheets';
import { parseBoq } from './parse';
import { addFileHeadings, planImport } from './toEstimateLine';
import type { Cell, SheetGrid } from './types';

const font = (f: string) => new Uint8Array(readFileSync(`public/fonts/${f}`));
setFontBytes({ regular: font('URWBookman-Light.ttf'), bold: font('URWBookman-Demi.ttf') });

const grid = (name: string, rows: Cell[][]): SheetGrid => ({ name, rows });
const HEAD: Cell[] = ['Sl No', 'Name of the Equipment/Materials', 'Unit', 'Qty', 'Supply rate', 'Supply amount', 'Erection rate', 'Erection amount'];
// The layout of a KPTCL terminal-bay sheet: a numbered heading row with no quantity, the items under it lettered or blank.
const BAY = grid('tb material', [
  HEAD,
  ['A1', 'CIRCUIT BREAKER : SF-6 Gas circuit breakers', null, null, null, null, null, null],
  [null, 'a) For 66KV Line', 'Nos.', 1, 703_010, 703_010, 8_652, 8_652],
  ['A2', 'ISOLATORS : Isolators including marshalling box', null, null, null, null, null, null],
  [null, 'a)Upright mounting type with Earth switch', 'Nos.', 1, 278_300, 278_300, 4_293, 4_293],
  [null, 'Note:-1) For details refer Annexure-IIB', null, null, null, null, null, null],
  ['A13', 'Materials for New Bays integration to SCADA Panel', null, null, null, null, null, null],
  ['a', 'Multi Functional Transducer(MFT) 0.2S class', 'Nos', 1, 4_875, 4_875, 1_555, 1_555],
  ['b', 'Opto Coupler(220 or 110kV DC) including labour', 'Nos', 1, 1_312, 1_312, 1_555, 1_555],
  ['A14', 'Sub total', null, null, null, 987_497, null, 16_055],
]);

const importAll = (sheets: SheetGrid[], pick: (k: number) => boolean = () => true) => {
  const read = parseBoq(sheets, 'est.xlsx', 'electrical');
  return planImport(read, read.items.filter((_, k) => pick(k)), new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name)), false);
};

describe('serial numbers read as in the uploaded estimate', () => {
  it('keeps each item’s own Sl. No. and the numbered heading rows above it', () => {
    const { lines } = importAll([BAY]);
    expect(lines.map((l) => l.code)).toEqual(['', '', 'a', 'b']);
    expect(lines.map((l) => (l.headings ?? []).map((h) => h.code))).toEqual([['A1'], ['A2'], ['A13'], []]);
    // The description is the file's own; the heading is printed above it, not joined into it.
    expect(lines[2]!.description).toBe('Multi Functional Transducer(MFT) 0.2S class');
    expect(lines[2]!.headings![0]!.text).toBe('Materials for New Bays integration to SCADA Panel');
    // The heading still helps match the line to the rate catalog.
    expect(lines[2]!.group).toContain('Materials for New Bays integration');
    // A note between items is not a heading.
    expect(lines.flatMap((l) => l.headings ?? []).some((h) => /note/i.test(h.text))).toBe(false);
  });

  it('keeps a heading when the item under it is left out of the import', () => {
    const { lines } = importAll([BAY], (k) => k !== 2);
    expect(lines.map((l) => (l.headings ?? []).map((h) => h.code))).toEqual([['A1'], ['A2'], ['A13']]);
    expect(lines[2]!.code).toBe('b');
  });

  it('prints the heading rows with their Sl. No. in the Excel download and the PDF', async () => {
    const dpr = row({ voltage: '66 kV', capacity: '2x20 MVA', stream: 'Greenfield' });
    const e = { ...buildTemplate(dpr), lines: importAll([BAY]).lines, misc: {} } as Estimate;
    const partA = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e)).find((s) => s.key === 'Part A Electrical')!;
    const body = partA.rows.filter((r) => !r.total).map((r) => [r.cells[0], r.cells[1]!.slice(0, 20)]);
    expect(body).toEqual([
      ['A1', 'CIRCUIT BREAKER : SF'],
      ['', 'a) For 66KV Line'],
      ['A2', 'ISOLATORS : Isolator'],
      ['', 'a)Upright mounting t'],
      ['A13', 'Materials for New Ba'],
      ['a', 'Multi Functional Tra'],
      ['b', 'Opto Coupler(220 or '],
    ]);
    expect(partA.rows.filter((r) => r.total).map((r) => r.cells[1])).toEqual(['Sub total', expect.any(String), 'Total']);
  });

  it('gives an estimate imported before this its heading rows back, from the reading saved with the DPR', () => {
    const read = parseBoq([BAY], 'est.xlsx', 'electrical');
    const fresh = planImport(read, read.items, new Set(['tb material']), false).lines;
    // As an older import saved it: no heading rows, the sub-item's heading joined onto its description.
    const old = fresh.map((x) => ({ ...x, headings: undefined })).map((l) => (l.code === 'a' ? { ...l, description: `Materials for New Bays integration to SCADA Panel — ${l.description}` } : l));
    const e = { ...buildTemplate(row({ voltage: '66 kV', capacity: '2x20 MVA', stream: 'Greenfield' })), lines: old, misc: {} } as Estimate;
    const back = addFileHeadings(e, [read]).lines;
    expect(back.map((l) => l.headings)).toEqual(fresh.map((l) => l.headings));
    expect(back.map((l) => l.description)).toEqual(fresh.map((l) => l.description));
  });
});
