import { exportWorkbook, sheet } from '@/lib/exportExcel';
import type { DprRow } from '@/features/reports/types';
import { abstractOf, generalAbstract, lineAmounts, sectionTotals } from './calc';
import { DEFAULT_FINANCIALS, summariseFinancials } from './finance';
import type { Estimate } from './types';

interface Row {
  code: string;
  description: string;
  unit: string;
  qty: number | string;
  supplyRate: number | string;
  supply: number | string;
  erectionRate: number | string;
  erection: number | string;
  testingRate: number | string;
  testing: number | string;
}

const blank = { code: '', unit: '', qty: '', supplyRate: '', erectionRate: '', testingRate: '' };

/** General abstract, Abstract-I and II, Part A, Part B and dismantling sheets, laid out like the KPTCL estimate. */
export function exportEstimate(dpr: DprRow, e: Estimate) {
  const { subTotal, total } = sectionTotals(e);
  const heading = `${dpr.project} (${dpr.id})`;
  const notes = [heading, `Capacity ${dpr.capacity}, ${dpr.voltage} · ${dpr.division} division · Generated ${new Date().toLocaleString('en-IN')}`];

  const lineRows = (section: Estimate['lines'][number]['section']): Row[] =>
    e.lines
      .filter((l) => l.section === section)
      .map((l) => {
        const a = lineAmounts(l);
        return { ...l, supply: a.supply, erection: a.erection, testing: a.testing };
      });

  const partA: Row[] = [
    ...lineRows('electrical'),
    { ...blank, description: 'Sub total', supply: subTotal.supply, erection: subTotal.erection, testing: subTotal.testing },
    { ...blank, description: 'Miscellaneous and unforeseen', supply: e.misc.supply, erection: e.misc.erection, testing: e.misc.testing },
    { ...blank, description: 'Total', supply: total.supply, erection: total.erection, testing: total.testing },
  ];
  const partB: Row[] = [
    ...lineRows('civil'),
    { ...blank, description: 'Sub total', supply: subTotal.civil, erection: '', testing: '' },
    { ...blank, description: 'Rounding off', supply: e.misc.civil, erection: '', testing: '' },
    { ...blank, description: 'Total amount', supply: total.civil, erection: '', testing: '' },
  ];

  const dismantling = e.lines.some((l) => l.section === 'dismantling');
  const partD: Row[] = [
    ...lineRows('dismantling'),
    { ...blank, description: 'Sub total', supply: subTotal.dismantling, erection: '', testing: '' },
    { ...blank, description: 'Miscellaneous', supply: e.misc.dismantling ?? 0, erection: '', testing: '' },
    { ...blank, description: 'Total', supply: total.dismantling, erection: '', testing: '' },
  ];
  const g = generalAbstract(e);
  const general = [
    { i: 1, label: 'Part A capital works (Abstract-I)', lakhs: g.capital },
    ...(dismantling ? [{ i: 2, label: 'Dismantling of the existing equipment (Abstract-II)', lakhs: g.dismantling }] : []),
    { i: '', label: 'Total project cost', lakhs: g.total },
  ];
  const abstractColumns = [
    { header: 'Sl. no.', width: 8, value: (r: { i: number | string }) => r.i },
    { header: 'Particulars', width: 70, value: (r: { label: string }) => r.label },
    { header: 'Amount (Rs. lakhs)', width: 20, value: (r: { lakhs: number }) => r.lakhs },
  ];
  const singleRateColumns = [
    { header: 'Sl. no.', width: 9, value: (r: Row) => r.code },
    { header: 'Particulars', width: 70, value: (r: Row) => r.description },
    { header: 'Unit', width: 8, value: (r: Row) => r.unit },
    { header: 'Qty', width: 9, value: (r: Row) => r.qty },
    { header: 'Rate', width: 14, value: (r: Row) => r.supplyRate },
    { header: 'Amount', width: 16, value: (r: Row) => r.supply },
  ];

  const f = e.financials ?? DEFAULT_FINANCIALS;
  const fs = summariseFinancials(g.total, f);
  const finance = [
    { label: 'Project cost (Rs lakh)', value: g.total },
    { label: 'Discount rate (%)', value: f.discountRatePct },
    { label: 'Benefit-cost ratio', value: fs.bcr === null ? '' : Number(fs.bcr.toFixed(2)) },
    { label: 'Internal rate of return (%)', value: fs.irr === null ? '' : Number((fs.irr * 100).toFixed(1)) },
    { label: 'Payback (years)', value: fs.payback ?? '' },
    { label: 'Discounted payback (years)', value: fs.discountedPayback ?? '' },
    { label: '', value: '' },
    ...f.benefits.map((b, i) => ({ label: `Benefit, year ${i + 1} (Rs lakh)`, value: b })),
  ];

  const date = new Date().toISOString().slice(0, 10);
  return exportWorkbook(`DPR_Estimate_${dpr.id.replace(/\W+/g, '-')}_${date}.xlsx`, [
    sheet({ sheetName: 'General Abstract', title: 'General abstract (Rs. lakhs)', notes, columns: abstractColumns, rows: general }),
    sheet({ sheetName: 'Abstract-I', title: 'Abstract-I: capital works (Rs. lakhs)', notes, columns: abstractColumns, rows: abstractOf(e, 'I').map((r, i) => ({ ...r, i: i + 1 })) }),
    ...(dismantling
      ? [sheet({ sheetName: 'Abstract-II', title: 'Abstract-II: dismantling (Rs. lakhs)', notes, columns: abstractColumns, rows: abstractOf(e, 'II').map((r, i) => ({ ...r, i: i + 1 })) })]
      : []),
    sheet<Row>({
      sheetName: 'Part A Electrical',
      title: 'Part A: Supply of materials, erection, testing & commissioning (Rs)',
      notes,
      columns: [
        { header: 'Sl. no.', width: 9, value: (r) => r.code },
        { header: 'Name of the equipment / materials', width: 60, value: (r) => r.description },
        { header: 'Unit', width: 8, value: (r) => r.unit },
        { header: 'Qty', width: 9, value: (r) => r.qty },
        { header: 'Supply unit price', width: 16, value: (r) => r.supplyRate },
        { header: 'Supply total', width: 16, value: (r) => r.supply },
        { header: 'Erection unit rate', width: 15, value: (r) => r.erectionRate },
        { header: 'Erection amount', width: 15, value: (r) => r.erection },
        { header: 'T&C unit rate', width: 13, value: (r) => r.testingRate },
        { header: 'T&C amount', width: 14, value: (r) => r.testing },
      ],
      rows: partA,
    }),
    sheet<Row>({
      sheetName: 'Part B Civil',
      title: 'Part B: Civil works (Rs)',
      notes,
      columns: [
        { header: 'Sl. no.', width: 9, value: (r) => r.code },
        { header: 'Particulars', width: 70, value: (r) => r.description },
        { header: 'Unit', width: 8, value: (r) => r.unit },
        { header: 'Qty', width: 9, value: (r) => r.qty },
        { header: 'Basic rate', width: 14, value: (r) => r.supplyRate },
        { header: 'Amount', width: 16, value: (r) => r.supply },
      ],
      rows: partB,
    }),
    sheet({
      sheetName: 'Cost-benefit',
      title: 'Cost-benefit analysis',
      notes,
      columns: [
        { header: 'Item', width: 36, value: (r: { label: string }) => r.label },
        { header: 'Value', width: 16, value: (r: { value: number | string }) => r.value },
      ],
      rows: finance,
    }),
    ...(dismantling ? [sheet<Row>({ sheetName: 'Dismantling', title: 'Dismantling: decommissioning part (Rs)', notes, columns: singleRateColumns, rows: partD })] : []),
  ]);
}
