import type { Estimate, EstimateLine } from './types';

const LAKH = 100_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const lineAmounts = (l: EstimateLine) => ({
  supply: r2(l.qty * l.supplyRate),
  erection: r2(l.qty * l.erectionRate),
  testing: r2(l.qty * l.testingRate),
});

export function sectionTotals(e: Estimate) {
  // Sum in paise so long lists of rupee amounts don't drift.
  const p = (n: number) => Math.round(n * 100);
  const c = { supply: 0, erection: 0, testing: 0, civil: 0, dismantling: 0 };
  for (const l of e.lines) {
    const a = lineAmounts(l);
    if (l.section === 'civil') c.civil += p(a.supply);
    else if (l.section === 'dismantling') c.dismantling += p(a.supply);
    else {
      c.supply += p(a.supply);
      c.erection += p(a.erection);
      c.testing += p(a.testing);
    }
  }
  const t = { supply: c.supply / 100, erection: c.erection / 100, testing: c.testing / 100, civil: c.civil / 100, dismantling: c.dismantling / 100 };
  return {
    subTotal: { supply: r2(t.supply), erection: r2(t.erection), testing: r2(t.testing), civil: r2(t.civil), dismantling: r2(t.dismantling) },
    total: {
      supply: r2(t.supply + e.misc.supply),
      erection: r2(t.erection + e.misc.erection),
      testing: r2(t.testing + e.misc.testing),
      civil: r2(t.civil + e.misc.civil),
      dismantling: r2(t.dismantling + (e.misc.dismantling ?? 0)),
    },
  };
}

export interface AbstractRow {
  key: string;
  label: string;
  /** Rs. lakhs, rounded to 2 decimals the way the estimate sheets do it. */
  lakhs: number;
  emphasis?: boolean;
}

export type AbstractPart = 'I' | 'II';

/**
 * Abstract-I (capital works) or Abstract-II (dismantling) of the DPR, in Rs lakh. Each row is shown
 * rounded to 0.01 lakh, but the arithmetic carries the unrounded values, as the KPTCL sheets do:
 * that is what makes the sample's Abstract-II come to 1.36 (1.10 + 0.055 + 0.2079 = 1.3629).
 */
export function abstractOf(e: Estimate, part: AbstractPart = 'I'): AbstractRow[] {
  const { total } = sectionTotals(e);
  const material = part === 'I' ? total.supply / LAKH : 0;
  const labour = part === 'I' ? (total.erection + total.testing) / LAKH : total.dismantling / LAKH;
  const civil = part === 'I' ? total.civil / LAKH : 0;
  const basic = material + labour + civil;
  const loading = (basic * e.areaLoadingPct) / 100;
  const gst = ((basic + loading) * e.gstPct) / 100;
  const tender = basic + loading + gst;
  const statutory = (part === 'I' ? e.statutoryCharges : (e.dismantlingStatutory ?? 0)) / LAKH;
  const rows: (Omit<AbstractRow, 'lakhs'> & { value: number })[] = [
    { key: 'material', label: 'Material cost', value: material },
    { key: 'labour', label: part === 'I' ? 'Labour / erection / testing & commissioning charges' : 'Labour / dismantling charges', value: labour },
    { key: 'civil', label: 'Cost of civil engineering works', value: civil },
    { key: 'basic', label: 'Basic rate (sum of 1 to 3)', value: basic, emphasis: true },
    { key: 'loading', label: `Area-specific loading on basic rate (${e.areaLoadingPct}%)`, value: loading },
    { key: 'gst', label: `Applicable GST on 4 and 5 (${e.gstPct}%)`, value: gst },
    { key: 'tender', label: 'Cost of the estimate put to tender (4 + 5 + 6)', value: tender, emphasis: true },
    { key: 'statutory', label: 'Statutory charges (PTCC, inspectorate, forest, compensation etc.)', value: statutory },
    { key: 'total', label: 'Total estimate cost (7 + 8)', value: tender + statutory, emphasis: true },
  ];
  return rows.map(({ value, ...r }) => ({ ...r, lakhs: r2(value) }));
}

export interface GeneralAbstract {
  capital: number;
  dismantling: number;
  total: number;
}

/** General abstract: Part A capital works (Abstract-I) plus dismantling (Abstract-II), Rs lakh. */
export function generalAbstract(e: Estimate): GeneralAbstract {
  const capital = abstractOf(e, 'I').at(-1)!.lakhs;
  const dismantling = e.lines.some((l) => l.section === 'dismantling') ? abstractOf(e, 'II').at(-1)!.lakhs : 0;
  return { capital, dismantling, total: r2(capital + dismantling) };
}

export const totalLakhs = (e: Estimate) => generalAbstract(e).total;

/** Lines that still need a rate, so the estimate is not silently understated. */
export const linesMissingRates = (e: Estimate) =>
  e.lines.filter((l) => l.qty > 0 && l.supplyRate === 0 && l.erectionRate === 0 && l.testingRate === 0);
