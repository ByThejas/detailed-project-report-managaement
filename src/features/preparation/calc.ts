import type { Estimate, EstimateLine, EstimateSection, FileAmount, RateKind } from './types';

const LAKH = 100_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A line's amount for one rate. A line read from an uploaded estimate shows the file's own amount while its quantity
 * and rate are the file's. Changed afterwards, the amount keeps the file's working: the amount per unit of quantity when
 * only the quantity changed, and the file's multiplier on qty × rate (a weight, a distance) when the rate changed.
 */
export function amountOf(qty: number, rate: number, f: FileAmount | undefined): number {
  const plain = r2(qty * rate);
  if (!f) return plain;
  if (f.qty === qty && f.rate === rate) return f.amount;
  if (f.rate === rate) return f.qty ? r2((f.amount / f.qty) * qty) : plain;
  return f.qty && f.rate ? r2(qty * rate * (f.amount / (f.qty * f.rate))) : plain;
}

export const lineAmount = (l: EstimateLine, kind: RateKind): number => amountOf(l.qty, l[`${kind}Rate`], l.fileAmounts?.[kind]);

export const lineAmounts = (l: EstimateLine) => ({
  supply: lineAmount(l, 'supply'),
  erection: lineAmount(l, 'erection'),
  testing: lineAmount(l, 'testing'),
});

/** Rs per unit of the line's quantity that its amount works out to: the rate itself unless the file's amount works on a weight or distance. */
export const effectiveRate = (l: EstimateLine, kind: RateKind): number => {
  const rate = l[`${kind}Rate`];
  if (!l.fileAmounts?.[kind] || !l.qty) return rate;
  const a = lineAmount(l, kind);
  return Math.abs(a - r2(l.qty * rate)) <= 1 ? rate : a / l.qty;
};

/** The multiplier the file's amount puts on qty × rate (e.g. 0.17 for "0.17 MT per tower"), when it is not 1. */
export const amountFactor = (l: EstimateLine, kind: RateKind): number | null => {
  const f = l.fileAmounts?.[kind];
  if (!f || !f.qty || !f.rate) return null;
  const k = f.amount / (f.qty * f.rate);
  return Math.abs(f.amount - f.qty * f.rate) <= 1 ? null : k;
};

type Totals = { supply: number; erection: number; testing: number; civil: number; dismantling: number; lineSupply: number; lineErection: number; lineTesting: number; lineCivil: number };
export type TotalKey = keyof Totals;

/** Where each section's amounts are added up: multi-rate sections use three keys, the others one. */
export const SECTION_KEYS: Record<EstimateSection, { supply: TotalKey; erection?: TotalKey; testing?: TotalKey }> = {
  electrical: { supply: 'supply', erection: 'erection', testing: 'testing' },
  civil: { supply: 'civil' },
  dismantling: { supply: 'dismantling' },
  line: { supply: 'lineSupply', erection: 'lineErection', testing: 'lineTesting' },
  lineCivil: { supply: 'lineCivil' },
};

export function sectionTotals(e: Estimate) {
  // Sum in paise so long lists of rupee amounts don't drift.
  const p = (n: number) => Math.round(n * 100);
  const c: Totals = { supply: 0, erection: 0, testing: 0, civil: 0, dismantling: 0, lineSupply: 0, lineErection: 0, lineTesting: 0, lineCivil: 0 };
  for (const l of e.lines) {
    const a = lineAmounts(l);
    const k = SECTION_KEYS[l.section];
    c[k.supply] += p(a.supply);
    if (k.erection) c[k.erection] += p(a.erection);
    if (k.testing) c[k.testing] += p(a.testing);
  }
  const subTotal = {} as Totals;
  const total = {} as Totals;
  for (const key of Object.keys(c) as TotalKey[]) {
    subTotal[key] = r2(c[key] / 100);
    total[key] = r2(c[key] / 100 + (e.misc[key] ?? 0));
  }
  return { subTotal, total };
}

export interface AbstractRow {
  key: string;
  label: string;
  /** Rs. lakhs, rounded to 2 decimals the way the estimate sheets do it. */
  lakhs: number;
  emphasis?: boolean;
}

/** I = substation capital works, II = dismantling, line = line works (e.g. a LILO line). */
export type AbstractPart = 'I' | 'II' | 'line';

export const hasLineWorks = (e: Estimate) => e.lines.some((l) => l.section === 'line' || l.section === 'lineCivil');

/** Unrounded abstract values in Rs lakh. */
export function abstractValues(e: Estimate, part: AbstractPart) {
  const { total } = sectionTotals(e);
  let material = 0;
  let labour = 0;
  let civil = 0;
  let statutory = 0;
  let forest = 0;
  let land = 0;
  if (part === 'I') {
    material = total.supply;
    labour = total.erection + total.testing;
    civil = total.civil;
    statutory = e.statutoryCharges;
    forest = e.forestCompensation ?? 0;
    land = e.landCompensation ?? 0;
  } else if (part === 'II') {
    labour = total.dismantling;
    statutory = e.dismantlingStatutory ?? 0;
  } else {
    material = total.lineSupply;
    labour = total.lineErection + total.lineTesting;
    civil = total.lineCivil;
    statutory = e.lineCharges?.statutory ?? 0;
    forest = e.lineCharges?.forestCompensation ?? 0;
    land = e.lineCharges?.landCompensation ?? 0;
  }
  const basic = (material + labour + civil) / LAKH;
  const loading = (basic * e.areaLoadingPct) / 100;
  const gst = ((basic + loading) * e.gstPct) / 100;
  const tender = basic + loading + gst;
  const total11 = tender + (statutory + forest + land) / LAKH;
  return { material: material / LAKH, labour: labour / LAKH, civil: civil / LAKH, basic, loading, gst, tender, statutory: statutory / LAKH, forest: forest / LAKH, land: land / LAKH, total: total11 };
}

/**
 * An abstract of the DPR in Rs lakh, in the 11 rows of the KPTCL estimate sheets. Each row is shown
 * rounded to 0.01 lakh, but the arithmetic carries the unrounded values, as the KPTCL sheets do:
 * that is what makes the Kogali sample's Abstract-II come to 1.36 (1.10 + 0.055 + 0.2079 = 1.3629).
 */
export function abstractOf(e: Estimate, part: AbstractPart = 'I'): AbstractRow[] {
  const v = abstractValues(e, part);
  const rows: (Omit<AbstractRow, 'lakhs'> & { value: number })[] = [
    { key: 'material', label: 'Material cost', value: v.material },
    { key: 'labour', label: part === 'II' ? 'Labour / dismantling charges' : 'Labour / erection / testing & commissioning charges', value: v.labour },
    { key: 'civil', label: 'Cost of civil engineering works', value: v.civil },
    { key: 'basic', label: 'Basic rate (sum of 1 to 3)', value: v.basic, emphasis: true },
    { key: 'loading', label: `Area-specific loading on basic rate (${e.areaLoadingPct}%)`, value: v.loading },
    { key: 'gst', label: `Applicable GST on 4 and 5 (${e.gstPct}%)`, value: v.gst },
    { key: 'tender', label: 'Cost of the estimate put to tender (4 + 5 + 6)', value: v.tender, emphasis: true },
    { key: 'statutory', label: 'Statutory charges (PTCC, Electrical Inspectorate etc.)', value: v.statutory },
    { key: 'forest', label: 'Forest clearance, tree / crop cut compensation', value: v.forest },
    { key: 'land', label: 'Land / corridor / tower-foot area compensation', value: v.land },
    { key: 'total', label: 'Total estimate cost (7 to 10)', value: v.total, emphasis: true },
  ];
  return rows.map(({ value, ...r }) => ({ ...r, lakhs: r2(value) }));
}

export interface GeneralAbstract {
  capital: number;
  line: number;
  dismantling: number;
  total: number;
}

/**
 * General abstract, Rs lakh: substation capital works (Abstract-I), line works and dismantling (Abstract-II).
 * The total adds the unrounded parts, as the GAB sheet does (Thyavanige: 1183.2219 + 89.9443 = 1273.17).
 */
export function generalAbstract(e: Estimate): GeneralAbstract {
  const capital = abstractValues(e, 'I').total;
  const line = hasLineWorks(e) ? abstractValues(e, 'line').total : 0;
  const dismantling = e.lines.some((l) => l.section === 'dismantling') ? abstractValues(e, 'II').total : 0;
  return { capital: r2(capital), line: r2(line), dismantling: r2(dismantling), total: r2(capital + line + dismantling) };
}

export const totalLakhs = (e: Estimate) => generalAbstract(e).total;

/** Lines that still need a rate, so the estimate is not silently understated. */
export const linesMissingRates = (e: Estimate) =>
  e.lines.filter((l) => l.qty > 0 && l.supplyRate === 0 && l.erectionRate === 0 && l.testingRate === 0);
