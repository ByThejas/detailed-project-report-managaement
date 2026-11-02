import { existsSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { abstractOf, generalAbstract } from '@/features/preparation/calc';
import { buildTemplate } from '@/features/preparation/template';
import { kindOfSheet, parseBoq, readAbstract, sectionOfSheet, warningsOf } from './parse';
import { readBoqWorkbook } from './readWorkbook';
import { applyImport, planImport } from './toEstimateLine';
import type { BoqReadResult, Cell, SheetGrid } from './types';

/**
 * The layout of a real KPTCL estimate workbook (Thyavanige, 23.03.25), cut down to a few rows per sheet:
 * two-row headers, "No/MT" quantities, lump sums, "Miscellaneous" rows that top a sheet up to a round
 * total, and abstract sheets with the area loading, GST, statutory charges and compensation.
 */
const ss: Cell[][] = [
  ['KARNATAKA POWER TRANSMISSION CORPORATION LIMITED'],
  [],
  ['PART-A: Supply of Materials, Erection, Testing and Commissioning'],
  ['Sl No.', null, 'Name of the Equipment/Materials', 'Unit', 'Quantity', 'Supply of Material', null, 'Erection charges', null, 'Testing and Comissioning charges', null],
  [null, null, null, null, null, 'Unit Rate (Excl. of GST and F&I) (in Rs.)', 'Amount (in Rs.)', 'Unit Rate Excl. of GST (in Rs.)', 'Amount (in Rs.)', 'Unit Rate Excl. of GST (in Rs.)', 'Amount (in Rs.)'],
  ['A1', null, 'Power Transformer'],
  [null, 1, 'Power Transformer 20 MVA, 66/11kV', "No's", 1, 31_247_000, 31_247_000, 200_739.4, 200_739.4, 71_159, 71_159],
  // Station towers: supply per No, erection per MT (5723 × 3.162 MT).
  [null, 1, 'Station Towers (Verticals 1T1)', "No's/MT", '3/3.162', 165_475.62, 496_426.86, 5_723, 18_096.13],
  // The amount carries a factor that the rate does not (× 0.48).
  [null, 2, 'Double pole structure using 9.5 m poles', 'Set', 1, 78_727, 37_788.96, 7_417, 7_417],
  // Lump sum: no quantity; the T&C rate cell only helped work the amount out.
  ['A22', null, 'Testing & Commissioning : Capacitor Bank with Reactors', 'L/S', null, null, null, 1, 22_228, 22_228],
  ['A28', null, 'SUB-TOTAL', null, null, null, 31_781_215.82, null, 248_480.53, null, 71_159],
  ['A29', null, 'Miscellaneous ', null, null, null, 218_784.18, null, 1_519.47, null, 8_841],
  ['A30', null, 'TOTAL', null, null, null, 32_000_000, null, 250_000, null, 80_000],
];
const civil: Cell[][] = [
  ['PART-B: SUB-STATION CIVIL PORTION'],
  ['Sl. No.', 'Specifications', 'SR Ref', 'Unit', 'Quantity', 'Base Rate', 'Amount'],
  ['B1', 'Construction of Embankment', '(V1/Pg7/1.8)', 'cum', 100, 474, 47_400],
  [null, 'Sub Total in Rs.', null, null, null, null, 47_400],
  [null, 'Miscellaneous ', null, null, null, null, 2_600],
  [null, 'Total Amount in Rs.', null, null, null, null, 50_000],
];
const line: Cell[][] = [
  ['Construction of 66kV LILO line'],
  ['Sl. No.', 'Description', 'Unit', 'Quantity', 'Material Cost', null, 'Labour Cost'],
  [null, null, null, null, 'Unit  Rate in Rs.', 'Amount (in Rs.)', 'Unit Rate (in Rs.)', 'Amount (in Rs.)'],
  [1, '110kV D - Normal (6.90729MT per tower)', 'No/ MT', '1/6.907289', 141_680, 978_624.71, 5_983, 41_326.31],
  [null, 'Sub Total :', 'No/MT', '1/6.907289'],
  [3, 'Number Plates', 'No', 3, 333, 999, 83, 249],
  ['B12', 'Sub-Total ', null, null, null, 979_623.71, null, 41_575.31],
  ['B13', 'Miscellaneous ', 'L/S', null, null, 20_376.29, null, 3_424.69],
  ['B14', 'TOTAL', null, null, null, 1_000_000, null, 45_000],
];
const abstract = (title: string, a: number[]): Cell[][] => [
  ['KARNATAKA POWER TRANSMISSION CORPORATION LIMITED.'],
  [title],
  ['ABSTRACT'],
  ['Sl No', 'Description', null, 'Amount in Rs.'],
  [1, 'Material Cost ', null, a[0]!],
  [2, 'Labour/Erection/Diamantling Charges and Testing & Commission', null, a[1]!],
  [3, 'Cost of Civil Engineering Works', null, a[2]!],
  [4, 'Basic Rate (Sum of Sl No. 1 to 3)', null, a[3]!],
  [5, 'Area specifics loading on Basic Rates (Sl No. 4) Wherever applicable', null, a[4]!],
  [6, 'Applicable GST on Sl No. 4 & 5', null, a[5]!],
  [7, 'Cost of the Estimate (Sum of Sl No. 4 to 6) Amount Put to Tender', null, a[6]!],
  [8, 'Statutory charges such as PTCC, Electrical Inspectorate, Payment to other Govt departments', null, a[7]!],
  [9, 'Forest Clearence, Tree/Crop Cut Compensation Etc.,', null, a[8]!],
  [10, 'Land/Corridor/Tower Foot Area Compensation etc.,', null, '-'],
  [11, 'Total Cost of Estimate (Sum of Sl No. 7 to 10)', null, a[9]!],
  [null, 'Say', 999, 'Lakhs'],
];
const workbook = (): SheetGrid[] => [
  { name: 'GAB', rows: [['GENERAL ABSTRACT'], ['Sl. No.', 'Particulars', null, null, 'Amount in Rs. Lakhs']] },
  { name: ' SS ABS', rows: abstract('Providing additional 1x20 MVA Power Transformer at 66/11kV Thyavanige sub-station', [32_000_000, 330_000, 50_000, 32_380_000, 971_400, 6_003_252, 39_354_652, 100_000, 0, 39_454_652]) },
  { name: 'SS Supply & Erection', rows: ss },
  { name: 'SS Civil', rows: civil },
  { name: 'Civil -Ele', rows: [['SUB-STATION CIVIL FOUNDATION ANNEXURE'], ['Items', 'Unit', 'Calculation']] },
  { name: 'TL ABS', rows: abstract('Construction of 66kV LILO line to 66/11kV Thyavanige sub-station', [1_000_000, 45_000, 0, 1_045_000, 31_350, 193_743, 1_270_093, 100_000, 672_247.54, 2_042_340.54]) },
  { name: 'Line Supply', rows: line },
  { name: 'Line supply Annexure', rows: [['SL No.', 'AP Nos', 'Type of Tower']] },
  { name: 'Compensation', rows: [['Tower Foot Compensation']] },
];

const all = (r: BoqReadResult) => new Set(r.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));

describe('KPTCL estimate workbooks', () => {
  it('tells BOQ, abstract and annexure sheets apart and sends each BOQ sheet to its part', () => {
    expect(['GAB', ' SS ABS', 'TL ABS', 'ABS Line', 'SS Civil', 'Line Civil Annexure', 'Compensation', 'Cable Trench', 'Road'].map(kindOfSheet)).toEqual([
      'abstract',
      'abstract',
      'abstract',
      'abstract',
      'boq',
      'annexure',
      'annexure',
      'annexure',
      'annexure',
    ]);
    expect(['SS Supply & Erection', 'SS Civil', 'Line Supply', 'Line Civil', 'Dismantling', 'Sheet1'].map(sectionOfSheet)).toEqual([
      'electrical',
      'civil',
      'line',
      'lineCivil',
      'dismantling',
      undefined,
    ]);
  });

  it('reads the BOQ sheets the way their own totals add up', () => {
    const r = parseBoq(workbook(), 'thyavanige.xlsx', 'electrical');
    expect(r.sheets.filter((s) => s.headerRow).map((s) => [s.name, s.section, s.includedByDefault])).toEqual([
      ['SS Supply & Erection', 'electrical', true],
      ['SS Civil', 'civil', true],
      ['Line Supply', 'line', true],
    ]);
    expect(r.sheets.find((s) => s.name === 'SS Supply & Erection')!.columns).toMatchObject({ description: 'C', qty: 'E', supplyRate: 'F', erectionRate: 'H', testingRate: 'J' });

    const towers = r.items.find((i) => i.description.startsWith('Station Towers'))!;
    expect(towers).toMatchObject({ qty: 3, unit: 'No (3.162 MT)', supplyRate: 165_475.62 });
    expect(towers.erectionRate * 3).toBeCloseTo(18_096.13, 1);
    expect(warningsOf(towers).map((w) => w.message)).toEqual([
      'Quantity “3/3.162” read as 3 No weighing 3.162 MT',
      'Erection rate 5,723 is per MT; taken as 6,032.04 per No (3.162 MT ÷ 3 No)',
    ]);
    const pole = r.items.find((i) => i.description.startsWith('Double pole'))!;
    expect(pole.supplyRate).toBe(37_788.96);
    const lumpSum = r.items.find((i) => i.code === 'A22')!;
    expect(lumpSum).toMatchObject({ qty: 1, supplyRate: 0, erectionRate: 22_228, testingRate: 0 });

    const tower = r.items.find((i) => i.sheet === 'Line Supply' && i.unit.startsWith('No'))!;
    expect(tower).toMatchObject({ qty: 1, unit: 'No (6.907289 MT)' });
    expect(tower.supplyRate).toBeCloseTo(978_624.71, 1);
    expect(r.items.find((i) => i.sheet === 'SS Civil')!.srRef).toBe('(V1/Pg7/1.8)');

    // Every stated total, including "Total" = sub-total + miscellaneous, matches.
    expect(r.totals.length).toBe(12);
    for (const t of r.totals) expect(Math.abs(t.stated - t.computed), `${t.sheet} row ${t.row} ${t.column}`).toBeLessThanOrEqual(1);
    expect(r.misc!.map((m) => [m.sheet, m.column, m.amount, m.statedTotal])).toEqual([
      ['SS Supply & Erection', 'supply', 218_784.18, 32_000_000],
      ['SS Supply & Erection', 'erection', 1_519.47, 250_000],
      ['SS Supply & Erection', 'testing', 8_841, 80_000],
      ['SS Civil', 'supply', 2_600, 50_000],
      ['Line Supply', 'supply', 20_376.29, 1_000_000],
      ['Line Supply', 'erection', 3_424.69, 45_000],
    ]);
  });

  it('reads the abstract sheets: percentages, statutory charges and compensation', () => {
    const tl = readAbstract(workbook()[5]!)!;
    expect(tl).toMatchObject({ part: 'line', material: 1_000_000, basic: 1_045_000, statutory: 100_000, forest: 672_247.54, areaLoadingPct: 3, gstPct: 18 });
    expect(tl.land).toBeUndefined();
    expect(readAbstract(workbook()[1]!)).toMatchObject({ part: 'I', areaLoadingPct: 3, statutory: 100_000, total: 39_454_652 });
    expect(readAbstract(workbook()[0]!)).toBeNull();
  });

  it('imports every part with its miscellaneous amount and charges, and the abstracts come out as in the file', () => {
    const r = parseBoq(workbook(), 'thyavanige.xlsx', 'electrical');
    const plan = planImport(r, r.items, all(r));
    expect(plan.sections).toEqual(['electrical', 'civil', 'line']);
    expect(plan.charges).toEqual({
      areaLoadingPct: 3,
      gstPct: 18,
      statutoryCharges: 100_000,
      forestCompensation: 0,
      landCompensation: 0,
      lineCharges: { statutory: 100_000, forestCompensation: 672_247.54, landCompensation: 0 },
    });
    const e = applyImport(buildTemplate({ capacity: '1x20 MVA', voltage: '66 kV', stream: 'Greenfield' }), plan, 'replace');
    const ssAbs = Object.fromEntries(abstractOf(e, 'I').map((a) => [a.key, a.lakhs]));
    expect(ssAbs).toMatchObject({ material: 320, labour: 3.3, civil: 0.5, total: 394.55 });
    expect(abstractOf(e, 'line').at(-1)!.lakhs).toBe(20.42);
    expect(generalAbstract(e)).toEqual({ capital: 394.55, line: 20.42, dismantling: 0, total: 414.97 });

    // A corrected quantity keeps the stated total: the miscellaneous amount absorbs the change, as on the sheet.
    const edited = r.items.map((i) => (i.description === 'Construction of Embankment' ? { ...i, qty: 101 } : i));
    const again = applyImport(e, planImport(r, edited, all(r)), 'replace');
    expect(again.misc.civil).toBe(2_126);
    expect(abstractOf(again, 'I').at(-1)!.lakhs).toBe(394.55);
  });

  it('keeps a saved formula result of 0 (ExcelJS drops it from the cell value)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Line Civil');
    ws.addRow(['Sl.No.', 'Particulars', 'Unit', 'Quantity', 'Unit Rate', 'Amount']);
    ws.addRow(['C3', 'Excavation in soft rock', 'Cmtr', { formula: 'X1', result: 0 }, 379.12, { formula: 'D2*E2', result: 0 }]);
    const r = await readBoqWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'line.xlsx', 'civil');
    expect(r.items[0]).toMatchObject({ qty: 0, supplyRate: 379.12 });
    expect(r.sheets[0]!.section).toBe('lineCivil');
  });

  // The real workbook is not committed (the repo is public). Put it at fixtures/private/thyavanige.xlsx to run this.
  const real = 'fixtures/private/thyavanige.xlsx';
  it.skipIf(!existsSync(real))('reproduces the Thyavanige estimate, Rs 1273.17 lakh, from the real workbook', async () => {
    const b = readFileSync(real);
    const r = await readBoqWorkbook(new Uint8Array(b).buffer, 'thyavanige.xlsx', 'electrical');
    expect(r.items.filter((i) => i.issues.some((x) => x.level === 'error'))).toEqual([]);
    for (const t of r.totals) expect(Math.abs(t.stated - t.computed), `${t.sheet} row ${t.row} ${t.column}`).toBeLessThanOrEqual(1);
    const e = applyImport(buildTemplate({ capacity: '1x20 MVA', voltage: '66 kV', stream: 'Greenfield' }), planImport(r, r.items, all(r)), 'replace');
    expect(Object.fromEntries(abstractOf(e, 'I').map((a) => [a.key, a.lakhs]))).toMatchObject({ material: 645, labour: 41.8, civil: 285.9, total: 1183.22 });
    expect(abstractOf(e, 'line').at(-1)!.lakhs).toBe(89.94);
    expect(generalAbstract(e).total).toBe(1273.17);
  });
});
