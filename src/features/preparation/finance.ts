/**
 * Cost-benefit figures for the DPR, Rs lakh. Benefits are per year, year 1 first; the project cost
 * is spent at the start (year 0). Matches the sample DPR's IRR (29%) and payback (7 years, discounted).
 */

export interface Financials {
  /** Discount rate for B/C ratio and discounted payback, % per year. */
  discountRatePct: number;
  /** Benefit in each year of the analysis period, Rs lakh. */
  benefits: number[];
}

export const DEFAULT_FINANCIALS: Financials = { discountRatePct: 10, benefits: [] };
export const ANALYSIS_YEARS = 30;

const pv = (rate: number, flows: number[]) => flows.reduce((s, b, i) => s + b / (1 + rate) ** (i + 1), 0);

/** Present value of benefits ÷ project cost. */
export function benefitCostRatio(cost: number, f: Financials): number | null {
  if (cost <= 0 || f.benefits.length === 0) return null;
  return pv(f.discountRatePct / 100, f.benefits) / cost;
}

/** Rate at which the benefits' present value equals the cost, or null when there is none between -99% and 1000%. */
export function internalRateOfReturn(cost: number, benefits: number[]): number | null {
  if (cost <= 0 || benefits.length === 0) return null;
  const f = (r: number) => pv(r, benefits) - cost;
  let lo = -0.99;
  let hi = 10;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** First year in which cumulative benefits (discounted when a rate is given) reach the cost, or null. */
export function paybackYear(cost: number, benefits: number[], ratePct = 0): number | null {
  if (cost <= 0) return null;
  let sum = 0;
  for (let i = 0; i < benefits.length; i++) {
    sum += benefits[i]! / (1 + ratePct / 100) ** (i + 1);
    if (sum >= cost) return i + 1;
  }
  return null;
}

export interface FinancialSummary {
  bcr: number | null;
  irr: number | null;
  payback: number | null;
  discountedPayback: number | null;
}

export function summariseFinancials(cost: number, f: Financials): FinancialSummary {
  return {
    bcr: benefitCostRatio(cost, f),
    irr: internalRateOfReturn(cost, f.benefits),
    payback: paybackYear(cost, f.benefits),
    discountedPayback: paybackYear(cost, f.benefits, f.discountRatePct),
  };
}

/**
 * Reads a column or row of numbers pasted from Excel. Accepts tabs, new lines, spaces or semicolons
 * between values and Indian digit grouping. Returns the values and any pieces that were not numbers.
 */
export function parsePastedNumbers(text: string): { values: number[]; rejected: string[] } {
  const values: number[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/[\t\n\r;]+|\s{2,}|(?<=\d)\s+(?=[\d-])/)) {
    const piece = raw.trim();
    if (!piece) continue;
    const plain = piece.replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(plain)) values.push(Number(plain));
    else rejected.push(piece);
  }
  return { values, rejected };
}
