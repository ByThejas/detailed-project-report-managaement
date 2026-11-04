import type { Workbook, Worksheet, CellValue } from 'exceljs';
import type { DprRow } from '@/features/reports/types';
import { abstractValues, generalAbstract, hasLineWorks, lineAmounts, sectionTotals, SECTION_KEYS, type AbstractPart, type TotalKey } from './calc';
import { ANALYSIS_YEARS, DEFAULT_BCR_INPUTS, DEFAULT_FINANCIALS, isBcrExempt, kptclAppraisal, summariseFinancials } from './finance';
import type { BcrInputs } from './finance';
import type { Estimate, EstimateSection } from './types';

const LAKH = 100_000;
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } } as const;
const INPUT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } } as const;
const RS = '#,##0.00';
const LAKHS = '#,##0.00';

/** A cell holding a live formula, with the app's own figure as the stored result so viewers that do not recalculate still show it. */
const f = (formula: string, result: number): CellValue => ({ formula, result });
const q = (sheet: string) => `'${sheet}'`;

interface Ref {
  sheet: string;
  cell: string;
}
const at = (r: Ref) => `${q(r.sheet)}!${r.cell}`;

interface AmountCol {
  /** Key in the totals this column adds up to. */
  key: TotalKey;
  rateHeader: string;
  amountHeader: string;
  rateOf: 'supplyRate' | 'erectionRate' | 'testingRate';
  amountOf: 'supply' | 'erection' | 'testing';
}

interface ItemSheetSpec {
  name: string;
  title: string;
  section: EstimateSection;
  descHeader: string;
  cols: AmountCol[];
  miscLabel: string;
  subLabel?: string;
  totalLabel?: string;
}

const col = (n: number) => String.fromCharCode(64 + n);

/**
 * Writes one BOQ sheet: qty and rates are the inputs, each amount is =ROUND(qty*rate,2), the sub total sums the
 * amounts, "Miscellaneous" is an input, and the total is sub total + miscellaneous. Returns the total cells.
 */
function itemSheet(wb: Workbook, e: Estimate, spec: ItemSheetSpec, notes: string[]): Partial<Record<TotalKey, Ref>> {
  const ws = wb.addWorksheet(spec.name);
  const { subTotal, total } = sectionTotals(e);
  const headers = ['Sl. no.', spec.descHeader, 'Unit', 'Qty', ...spec.cols.flatMap((c) => [c.rateHeader, c.amountHeader])];
  ws.columns = headers.map((_, i) => ({ width: i === 1 ? 62 : i === 0 ? 9 : i === 2 ? 8 : 16 }));
  ws.addRow([spec.title]).font = { bold: true, size: 14 };
  for (const n of notes) ws.addRow([n]).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const header = ws.addRow(headers);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: header.number }];

  const lines = e.lines.filter((l) => l.section === spec.section);
  for (const l of lines) {
    const a = lineAmounts(l);
    const row = ws.addRow([l.code, l.description, l.unit, l.qty]);
    const r = row.number;
    spec.cols.forEach((c, i) => {
      const rc = 5 + i * 2;
      row.getCell(rc).value = l[c.rateOf];
      row.getCell(rc + 1).value = f(`ROUND($D${r}*${col(rc)}${r},2)`, a[c.amountOf]);
      row.getCell(rc).fill = INPUT_FILL;
      row.getCell(rc).numFmt = RS;
      row.getCell(rc + 1).numFmt = RS;
    });
    row.getCell(4).fill = INPUT_FILL;
    row.alignment = { vertical: 'top', wrapText: true };
  }

  const first = header.number;
  const last = ws.rowCount;
  const sub = ws.addRow([null, spec.subLabel ?? 'Sub total']);
  const misc = ws.addRow([null, spec.miscLabel]);
  const tot = ws.addRow([null, spec.totalLabel ?? 'Total']);
  const keys = SECTION_KEYS[spec.section];
  const refs: Partial<Record<TotalKey, Ref>> = {};
  spec.cols.forEach((_, i) => {
    const ac = col(6 + i * 2);
    const k = [keys.supply, keys.erection, keys.testing][i] as TotalKey;
    // The range starts at the header row, whose text SUM ignores, so a sheet with no items still sums to 0.
    sub.getCell(6 + i * 2).value = f(`SUM(${ac}${first}:${ac}${last})`, subTotal[k]);
    misc.getCell(6 + i * 2).value = e.misc[k] ?? 0;
    misc.getCell(6 + i * 2).fill = INPUT_FILL;
    tot.getCell(6 + i * 2).value = f(`${ac}${sub.number}+${ac}${misc.number}`, total[k]);
    for (const r of [sub, misc, tot]) r.getCell(6 + i * 2).numFmt = RS;
    refs[k] = { sheet: spec.name, cell: `${ac}${tot.number}` };
  });
  sub.font = { bold: true };
  tot.font = { bold: true };
  ws.addRow([]);
  ws.addRow(['Yellow cells are inputs (quantity, rates, miscellaneous). Amounts and totals are formulas.']).font = { italic: true, color: { argb: 'FF64748B' } };
  return refs;
}

interface AbstractSpec {
  name: string;
  title: string;
  part: AbstractPart;
  material?: string;
  labour?: string;
  civil?: string;
  charges: { statutory: number; forest: number; land: number };
  labels: { labour: string };
}

/** An abstract sheet in the 11 rows of the KPTCL estimate. Every row is a formula over the item sheets' totals and the yellow inputs below the table. */
function abstractSheet(wb: Workbook, e: Estimate, spec: AbstractSpec, notes: string[]): Ref {
  const ws = wb.addWorksheet(spec.name);
  ws.columns = [{ width: 8 }, { width: 70 }, { width: 20 }];
  ws.addRow([spec.title]).font = { bold: true, size: 14 };
  for (const n of notes) ws.addRow([n]).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const header = ws.addRow(['Sl. no.', 'Particulars', 'Amount (Rs. lakhs)']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => (c.fill = HEADER_FILL));
  ws.views = [{ state: 'frozen', ySplit: header.number }];
  const v = abstractValues(e, spec.part);
  const t = header.number + 1; // first data row
  const inputsAt = t + 13;
  const pct = `$C$${inputsAt}`;
  const gst = `$C$${inputsAt + 1}`;
  const rows: [string, string, string, number][] = [
    ['1', 'Material cost', spec.material ? `${spec.material}/${LAKH}` : '0', v.material],
    ['2', spec.labels.labour, spec.labour ? `(${spec.labour})/${LAKH}` : '0', v.labour],
    ['3', 'Cost of civil engineering works', spec.civil ? `${spec.civil}/${LAKH}` : '0', v.civil],
    ['4', 'Basic rate (sum of 1 to 3)', `SUM(C${t}:C${t + 2})`, v.basic],
    ['5', `Area-specific loading on basic rate`, `C${t + 3}*${pct}/100`, v.loading],
    ['6', 'Applicable GST on 4 and 5', `(C${t + 3}+C${t + 4})*${gst}/100`, v.gst],
    ['7', 'Cost of the estimate put to tender (4 + 5 + 6)', `C${t + 3}+C${t + 4}+C${t + 5}`, v.tender],
    ['8', 'Statutory charges (PTCC, Electrical Inspectorate etc.)', `C${inputsAt + 2}/${LAKH}`, v.statutory],
    ['9', 'Forest clearance, tree / crop cut compensation', `C${inputsAt + 3}/${LAKH}`, v.forest],
    ['10', 'Land / corridor / tower-foot area compensation', `C${inputsAt + 4}/${LAKH}`, v.land],
    ['', 'Total estimate cost (7 to 10)', `C${t + 6}+SUM(C${t + 7}:C${t + 9})`, v.total],
  ];
  rows.forEach(([i, label, formula, result], k) => {
    const row = ws.addRow([i, label, f(formula, result)]);
    row.getCell(3).numFmt = LAKHS;
    if ([3, 6, 10].includes(k)) row.font = { bold: true };
  });
  ws.addRow([]);
  ws.addRow(['Inputs']).font = { bold: true };
  const inp = (label: string, value: number) => {
    const r = ws.addRow([null, label, value]);
    r.getCell(3).fill = INPUT_FILL;
    return r;
  };
  inp('Area-specific loading on basic rate (%)', e.areaLoadingPct);
  inp('GST on basic rate and loading (%)', e.gstPct);
  inp('Statutory charges (Rs)', spec.charges.statutory);
  inp('Forest / tree / crop compensation (Rs)', spec.charges.forest);
  inp('Land / corridor compensation (Rs)', spec.charges.land);
  return { sheet: spec.name, cell: `C${t + 10}` };
}

/** Builds the estimate workbook with every amount, total, abstract row and the general abstract as a live formula. Exported for tests. */
export async function buildEstimateWorkbook(dpr: DprRow, e: Estimate): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DPR Manager';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const notes = [`${dpr.project} (${dpr.id})`, `Capacity ${dpr.capacity}, ${dpr.voltage} · ${dpr.division} division · Generated ${new Date().toLocaleString('en-IN')}`];
  const lineWorks = hasLineWorks(e);
  const dismantling = e.lines.some((l) => l.section === 'dismantling');

  // The general abstract comes first in the workbook, so reserve its place and fill it once the other sheets exist.
  const gab = wb.addWorksheet('General Abstract');

  const A = itemSheet(wb, e, {
    name: 'Part A Electrical', title: 'Part A: Supply of materials, erection, testing & commissioning (Rs)', section: 'electrical',
    descHeader: 'Name of the equipment / materials', miscLabel: 'Miscellaneous and unforeseen',
    cols: [
      { key: 'supply', rateHeader: 'Supply unit price', amountHeader: 'Supply total', rateOf: 'supplyRate', amountOf: 'supply' },
      { key: 'erection', rateHeader: 'Erection unit rate', amountHeader: 'Erection amount', rateOf: 'erectionRate', amountOf: 'erection' },
      { key: 'testing', rateHeader: 'T&C unit rate', amountHeader: 'T&C amount', rateOf: 'testingRate', amountOf: 'testing' },
    ],
  }, notes);
  const B = itemSheet(wb, e, {
    name: 'Part B Civil', title: 'Part B: Civil works (Rs)', section: 'civil', descHeader: 'Particulars', miscLabel: 'Rounding off', totalLabel: 'Total amount',
    cols: [{ key: 'civil', rateHeader: 'Basic rate', amountHeader: 'Amount', rateOf: 'supplyRate', amountOf: 'supply' }],
  }, notes);
  let L: Partial<Record<TotalKey, Ref>> = {};
  let LC: Partial<Record<TotalKey, Ref>> = {};
  if (lineWorks) {
    L = itemSheet(wb, e, {
      name: 'Line Supply', title: 'Line works: supply and erection (Rs)', section: 'line', descHeader: 'Description', miscLabel: 'Miscellaneous',
      cols: [
        { key: 'lineSupply', rateHeader: 'Material unit rate', amountHeader: 'Material amount', rateOf: 'supplyRate', amountOf: 'supply' },
        { key: 'lineErection', rateHeader: 'Labour unit rate', amountHeader: 'Labour amount', rateOf: 'erectionRate', amountOf: 'erection' },
        { key: 'lineTesting', rateHeader: 'T&C unit rate', amountHeader: 'T&C amount', rateOf: 'testingRate', amountOf: 'testing' },
      ],
    }, notes);
    LC = itemSheet(wb, e, {
      name: 'Line Civil', title: 'Line works: civil portion (Rs)', section: 'lineCivil', descHeader: 'Particulars', miscLabel: 'Miscellaneous and unforeseen',
      cols: [{ key: 'lineCivil', rateHeader: 'Basic rate', amountHeader: 'Amount', rateOf: 'supplyRate', amountOf: 'supply' }],
    }, notes);
  }
  let D: Partial<Record<TotalKey, Ref>> = {};
  if (dismantling)
    D = itemSheet(wb, e, {
      name: 'Dismantling', title: 'Dismantling: decommissioning part (Rs)', section: 'dismantling', descHeader: 'Particulars', miscLabel: 'Miscellaneous',
      cols: [{ key: 'dismantling', rateHeader: 'Rate', amountHeader: 'Amount', rateOf: 'supplyRate', amountOf: 'supply' }],
    }, notes);

  const ref = (r?: Ref) => (r ? at(r) : '0');
  const absI = abstractSheet(wb, e, {
    name: 'Abstract-I', title: 'Abstract-I: capital works (Rs. lakhs)', part: 'I',
    material: ref(A.supply), labour: `${ref(A.erection)}+${ref(A.testing)}`, civil: ref(B.civil),
    charges: { statutory: e.statutoryCharges, forest: e.forestCompensation ?? 0, land: e.landCompensation ?? 0 },
    labels: { labour: 'Labour / erection / testing & commissioning charges' },
  }, notes);
  const absLine = lineWorks
    ? abstractSheet(wb, e, {
        name: 'Line Abstract', title: 'Abstract: line works (Rs. lakhs)', part: 'line',
        material: ref(L.lineSupply), labour: `${ref(L.lineErection)}+${ref(L.lineTesting)}`, civil: ref(LC.lineCivil),
        charges: { statutory: e.lineCharges?.statutory ?? 0, forest: e.lineCharges?.forestCompensation ?? 0, land: e.lineCharges?.landCompensation ?? 0 },
        labels: { labour: 'Labour / erection / testing & commissioning charges' },
      }, notes)
    : null;
  const absII = dismantling
    ? abstractSheet(wb, e, {
        name: 'Abstract-II', title: 'Abstract-II: dismantling (Rs. lakhs)', part: 'II',
        labour: ref(D.dismantling), charges: { statutory: e.dismantlingStatutory ?? 0, forest: 0, land: 0 },
        labels: { labour: 'Labour / dismantling charges' },
      }, notes)
    : null;

  // General abstract: each part links to its abstract's total; the project total adds them.
  const g = generalAbstract(e);
  gab.columns = [{ width: 8 }, { width: 70 }, { width: 20 }];
  gab.addRow(['General abstract (Rs. lakhs)']).font = { bold: true, size: 14 };
  for (const n of notes) gab.addRow([n]).font = { italic: true, color: { argb: 'FF64748B' } };
  gab.addRow([]);
  const gh = gab.addRow(['Sl. no.', 'Particulars', 'Amount (Rs. lakhs)']);
  gh.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  gh.eachCell((c) => (c.fill = HEADER_FILL));
  gab.views = [{ state: 'frozen', ySplit: gh.number }];
  // Parts link to their abstract's unrounded total (shown to 2 places), as in the KPTCL workbook's GAB.
  const parts: [string, Ref, number][] = [['Substation capital works (Abstract-I)', absI, abstractValues(e, 'I').total]];
  if (absLine) parts.push(['Line works', absLine, abstractValues(e, 'line').total]);
  if (absII) parts.push(['Dismantling of the existing equipment (Abstract-II)', absII, abstractValues(e, 'II').total]);
  const firstPart = gab.rowCount + 1;
  parts.forEach(([label, r, val], i) => {
    const row = gab.addRow([i + 1, label, f(at(r), val)]);
    row.getCell(3).numFmt = LAKHS;
  });
  const gt = gab.addRow([null, 'Total project cost', f(`ROUND(SUM(C${firstPart}:C${gab.rowCount}),2)`, g.total)]);
  gt.font = { bold: true };
  gt.getCell(3).numFmt = LAKHS;
  const projectCost: Ref = { sheet: 'General Abstract', cell: `C${gt.number}` };

  const fin = e.financials ?? DEFAULT_FINANCIALS;
  // Pure line works carry no BCR (ADR-0007).
  if (isBcrExempt(e)) return wb;
  if (fin.method === 'kptcl') bcrSheets(wb, dpr, fin.inputs ?? DEFAULT_BCR_INPUTS, g.total, projectCost);
  else financeSheet(wb, e, g.total, projectCost, notes);
  return wb;
}

function financeSheet(wb: Workbook, e: Estimate, totalLakhs: number, cost: Ref, notes: string[]) {
  const ws: Worksheet = wb.addWorksheet('Cost-benefit');
  ws.columns = [{ width: 52 }, { width: 18 }];
  ws.addRow(['Cost-benefit analysis']).font = { bold: true, size: 14 };
  for (const n of notes) ws.addRow([n]).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const fin = e.financials ?? DEFAULT_FINANCIALS;
  const inputs = fin.inputs ?? DEFAULT_BCR_INPUTS;
  const fs = summariseFinancials(totalLakhs, fin);
  const kptcl = fin.method === 'kptcl' ? kptclAppraisal(totalLakhs, inputs) : null;
  const rows: [string, CellValue][] = [
    ['Project cost (Rs lakh), linked to the General Abstract', f(at(cost), totalLakhs)],
    ['Method', kptcl ? 'KPTCL BCR workbook (from inputs)' : 'Benefits entered by hand'],
    ...(kptcl
      ? ([
          ['Additional load (MVA)', inputs.addedMva],
          ['Energy savings (MU)', inputs.energySavingsMu],
          ['Sale price (Rs/unit)', inputs.salePrice],
          ['Transmission charges (Rs/unit)', inputs.transmissionCharge],
          ['Load growth (%)', inputs.loadGrowthPct],
          ['Discount rate (%)', inputs.discountRatePct],
          ['O&M (% of cost)', inputs.omPct],
          ['Escalation (%)', inputs.escalationPct],
        ] as [string, CellValue][])
      : ([['Discount rate (%)', fin.discountRatePct]] as [string, CellValue][])),
    ['Benefit-cost ratio (as calculated in the app)', fs.bcr === null ? '' : Number(fs.bcr.toFixed(2))],
    ['Internal rate of return (%)', fs.irr === null ? '' : Number((fs.irr * 100).toFixed(1))],
    ['Payback (years)', fs.payback ?? ''],
    ['Discounted payback (years)', fs.discountedPayback ?? ''],
    ['', ''],
    ...(kptcl
      ? kptcl.schedule.map((y): [string, CellValue] => [`Year ${y.year}: income / cash flow / cumulative DCF (Rs lakh)`, `${y.income.toFixed(2)} / ${y.cashFlow.toFixed(2)} / ${y.cumulative.toFixed(2)}`])
      : fin.benefits.map((b, i): [string, CellValue] => [`Benefit, year ${i + 1} (Rs lakh)`, b])),
  ];
  for (const r of rows) ws.addRow(r);
}

const NAVY = 'FF1F2A6B';
const band = (ws: Worksheet, range: string, text: string) => {
  ws.mergeCells(range);
  const c = ws.getCell(range.split(':')[0]!);
  c.value = text;
  c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
};

/**
 * The KPTCL BCR calculator's report, as two sheets: "BCR Analysis" (inputs, headline results, appraisal summary)
 * and "BCR Schedule" (the 30-year schedule). The project cost links to the General Abstract and every result
 * is a formula over the yellow inputs, so the BCR moves with the estimate.
 */
function bcrSheets(wb: Workbook, dpr: DprRow, i: BcrInputs, cost: number, costRef: Ref) {
  const a = kptclAppraisal(cost, i);
  const A = 'BCR Analysis';
  const S = 'BCR Schedule';
  const ws = wb.addWorksheet(A, { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 2.5 }, { width: 42 }, { width: 13 }, { width: 10 }, { width: 2.5 }, { width: 44 }, { width: 16 }];
  const head = (r: number, text: string, size: number, bold = true) => {
    ws.mergeCells(`B${r}:G${r}`);
    const c = ws.getCell(`B${r}`);
    c.value = text;
    c.font = { bold, size, color: { argb: NAVY } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  head(2, 'KARNATAKA POWER TRANSMISSION CORPORATION LIMITED', 14);
  head(3, 'A GOVERNMENT OF KARNATAKA UNDERTAKING', 9, false);
  head(4, 'BCR ANALYSIS', 16);
  head(5, dpr.project, 12);
  ws.getRow(5).height = 40;

  band(ws, 'B7:D7', '  INPUT PARAMETERS');
  const inputs: [string, CellValue, string, string][] = [
    ['Additional load after enhancement', i.addedMva, 'MVA', '0.00'],
    ['DPR / project cost (from the General Abstract)', f(at(costRef), cost), 'Lakhs', '#,##0.00'],
    ['Energy savings', i.energySavingsMu, 'MU', '0.0000'],
    ['Sale price of energy', i.salePrice, 'Rs./Unit', '0.00'],
    ['Transmission charges', i.transmissionCharge, 'Rs./Unit', '0.000'],
    ['Load growth', i.loadGrowthPct, '%', '0.##'],
    ['Discount rate', i.discountRatePct, '%', '0.##'],
    ['O & M cost', i.omPct, '%', '0.##'],
    ['Escalation on energy and transmission charges', i.escalationPct, '% p.a.', '0.##'],
    ['Power factor', i.powerFactor, '', '0.00'],
    ['Load factor', i.loadFactor, '', '0.00'],
  ];
  inputs.forEach(([label, value, unit, numFmt], k) => {
    const r = ws.getRow(8 + k);
    r.getCell(2).value = label;
    r.getCell(3).value = value;
    r.getCell(3).numFmt = numFmt;
    r.getCell(4).value = unit;
    if (k !== 1) r.getCell(3).fill = INPUT_FILL;
  });
  const I = (k: number) => `'${A}'!$C$${8 + k}`;
  const [load, dprCost, esav, sale, tc, growth, disc, om, esc, pf, lf] = inputs.map((_, k) => I(k));
  ws.mergeCells('B20:D21');
  ws.getCell('B20').value = `Escalation is applied each year over a ${ANALYSIS_YEARS}-year horizon. Payback is the first full year in which the cumulative discounted cash flow turns positive. Yellow cells are inputs.`;
  ws.getCell('B20').alignment = { wrapText: true, vertical: 'top' };
  ws.getCell('B20').font = { italic: true, size: 9 };

  // Schedule sheet first, so the summary can point at it.
  const sc = wb.addWorksheet(S, { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  sc.columns = [7, 13, 14, 12, 12, 14, 12, 13, 12, 14, 15].map((width) => ({ width }));
  band(sc, 'A1:K1', '  YEAR-WISE SCHEDULE  ·  all figures in Lakhs unless noted');
  const hdr = sc.getRow(2);
  ['Year', 'Energy charge (Rs./Unit)', 'Transmission charge (Rs./Unit)', 'Savings (L)', 'Addl. sale (MU)', 'Addl. savings (L)', 'Income (L)', 'Cash flow (L)', 'Discount factor', 'Discounted CF (L)', 'Cumulative DCF (L)'].forEach((h, k) => {
    const c = hdr.getCell(k + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
  });
  hdr.height = 34;
  const y0 = sc.getRow(3);
  y0.values = [0, '–', '–', '–', '–', '–', '–'];
  y0.getCell(8).value = f(`-${dprCost}`, -cost);
  y0.getCell(9).value = f(`1/(1+${disc}/100)^A3`, 1);
  y0.getCell(10).value = f('H3*I3', -cost);
  y0.getCell(11).value = f('J3', -cost);
  const years = a?.schedule ?? [];
  for (let n = 1; n <= ANALYSIS_YEARS; n++) {
    const r = 3 + n;
    const y = years[n - 1];
    const row = sc.getRow(r);
    row.getCell(1).value = n;
    row.getCell(2).value = f(`${sale}*(1+${esc}/100)^(A${r}-1)`, y?.energyCharge ?? 0);
    row.getCell(3).value = f(`${tc}*(1+${esc}/100)^(A${r}-1)`, y?.transmissionCharge ?? 0);
    row.getCell(4).value = f(`B${r}*${esav}*10`, y?.savings ?? 0);
    // Energy the added MVA can deliver: MVA × pf × lf × 8760 / 1000 MU, reached as the load grows.
    row.getCell(5).value = f(`MIN(${load}*${pf}*${lf}*8.76,${load}*${pf}*${lf}*8.76*((1+${growth}/100)^A${r}-1))`, y?.additionalSaleMu ?? 0);
    row.getCell(6).value = f(`E${r}*C${r}*10`, y?.additionalSavings ?? 0);
    row.getCell(7).value = f(`D${r}+F${r}`, y?.income ?? 0);
    row.getCell(8).value = f(`G${r}-${dprCost}*${om}/100`, y?.cashFlow ?? 0);
    row.getCell(9).value = f(`1/(1+${disc}/100)^A${r}`, y?.discountFactor ?? 0);
    row.getCell(10).value = f(`H${r}*I${r}`, y?.discountedCashFlow ?? 0);
    row.getCell(11).value = f(`K${r - 1}+J${r}`, y?.cumulative ?? 0);
  }
  const last = 3 + ANALYSIS_YEARS;
  const tot = sc.getRow(last + 1);
  sc.mergeCells(`A${last + 1}:C${last + 1}`);
  tot.getCell(1).value = 'TOTAL';
  const sumOf = (k: keyof NonNullable<typeof a>['schedule'][number]) => years.reduce((x, y) => x + (y[k] as number), 0);
  for (const [c, k] of [['D', 'savings'], ['F', 'additionalSavings'], ['G', 'income']] as const) tot.getCell(c).value = f(`SUM(${c}4:${c}${last})`, sumOf(k));
  tot.getCell('H').value = f(`SUM(H3:H${last})`, sumOf('cashFlow') - cost);
  tot.getCell('J').value = f(`SUM(J3:J${last})`, sumOf('discountedCashFlow') - cost);
  tot.getCell('K').value = f(`K${last}`, years.at(-1)?.cumulative ?? 0);
  tot.font = { bold: true };
  for (let r = 3; r <= last + 1; r++) {
    const row = sc.getRow(r);
    ['0.00', '0.00', '0.000', '#,##0.00', '0.000', '#,##0.00', '#,##0.00', '#,##0.00', '0.0000', '#,##0.00', '#,##0.00'].forEach((fmt, k) => {
      if (k > 0) row.getCell(k + 1).numFmt = fmt;
    });
  }

  // Headline results and appraisal summary, all formulas over the schedule.
  const yrs = (c: string) => `'${S}'!${c}4:${c}${last}`;
  band(ws, 'F7:G7', '  HEADLINE RESULTS');
  band(ws, 'F15:G15', '  APPRAISAL SUMMARY');
  const summary: [string, string, number | null, string][] = [
    ['NPV of benefits (Lakhs)', `SUM(${yrs('J')})`, a?.npvBenefits ?? 0, '#,##0.00'],
    ['NPV of capital outflow (Lakhs)', `${dprCost}+${dprCost}*${om}/100*SUM(${yrs('I')})`, a?.npvCapital ?? 0, '#,##0.00'],
    ['Minimum capital requirement (Lakhs)', `-MIN('${S}'!K3:K${last})`, a?.mcr ?? 0, '#,##0.00'],
    ['B/C — NPV ÷ MCR + 1 (method 1)', `(G16-${dprCost})/G18+1`, a?.bcrMethod1 ?? 0, '0.00'],
    ['B/C — NPV benefits ÷ NPV capital (method 2)', 'G16/G17', a?.bcr ?? 0, '0.00'],
    ['Total undiscounted income (Lakhs)', `SUM(${yrs('G')})`, a?.totalIncome ?? 0, '#,##0.00'],
    ['NPV of cash-flow stream (Lakhs)', `SUM('${S}'!J3:J${last})`, a ? a.npvBenefits - cost : 0, '#,##0.00'],
  ];
  summary.forEach(([label, formula, result, numFmt], k) => {
    const r = ws.getRow(16 + k);
    r.getCell(6).value = label;
    r.getCell(7).value = f(formula, result ?? 0);
    r.getCell(7).numFmt = numFmt;
    if (k === 3 || k === 4) r.font = { bold: true, color: { argb: NAVY } };
  });
  const kpi = (r: number, label: string, formula: string, result: CellValue, numFmt: string, note: string, noteResult: string) => {
    ws.getCell(`F${r}`).value = label;
    ws.getCell(`F${r}`).font = { bold: true, size: 9, color: { argb: NAVY } };
    ws.mergeCells(`G${r}:G${r + 1}`);
    const c = ws.getCell(`G${r}`);
    c.value = { formula, result } as CellValue;
    c.numFmt = numFmt;
    c.font = { bold: true, size: 16, color: { argb: NAVY } };
    c.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(`F${r + 1}`).value = { formula: note, result: noteResult } as CellValue;
    ws.getCell(`F${r + 1}`).font = { size: 9 };
  };
  const irr = a?.irr ?? null;
  const pay = a?.payback ?? null;
  kpi(8, 'Benefit–Cost Ratio', 'G20', a?.bcr ?? 0, '0.00', 'IF(G8>=1,"Viable (≥ 1.00)","Below threshold")', (a?.bcr ?? 0) >= 1 ? 'Viable (≥ 1.00)' : 'Below threshold');
  kpi(10, 'Payback period (years, discounted)', `IFERROR(INDEX(${yrs('A')},MATCH(TRUE,INDEX(${yrs('K')}>=0,0),0)),"Not recovered")`, pay ?? 'Not recovered', '0', `IF(ISNUMBER(G10),"Break-even within year "&G10,"Not recovered in horizon")`, pay === null ? 'Not recovered in horizon' : `Break-even within year ${pay}`);
  kpi(12, 'IRR', `IFERROR(IRR('${S}'!H3:H${last}),"—")`, irr ?? '—', '0.0%', `"against a "&${disc}&"% discount rate"`, `against a ${i.discountRatePct}% discount rate`);
}

/** General abstract, abstracts, Part A, Part B, line works and dismantling sheets, laid out like the KPTCL estimate, with live formulas throughout. */
export async function exportEstimate(dpr: DprRow, e: Estimate) {
  const wb = await buildEstimateWorkbook(dpr, e);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DPR_Estimate_${dpr.id.replace(/\W+/g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
