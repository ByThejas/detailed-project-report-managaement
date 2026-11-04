/**
 * Cost-benefit figures for the DPR, Rs lakh. Benefits are per year, year 1 first; the project cost
 * is spent at the start (year 0). The manual method matches the Kogali sample's IRR (29%) and payback
 * (7 years, discounted); the KPTCL method matches the Thyavanige DPR.
 */

import { hasLineWorks } from './calc';
import type { Estimate } from './types';

/** A power transformer (by MVA rating or by name) in the estimate means the station's capacity changes. */
const CAPACITY_CHANGE = /\bpower\s+transformer|\b\d+(?:\.\d+)?\s*mva\b/i;

/**
 * Pure line works: a line and its terminal bays, with no change in substation capacity (no power
 * transformer anywhere in the estimate). KPTCL does not ask for a Financial BCR for these (ADR-0007).
 */
export const isPureLineWorks = (e: Estimate) => hasLineWorks(e) && !e.lines.some((l) => l.section !== 'dismantling' && CAPACITY_CHANGE.test(l.description));

/** Whether this DPR carries no BCR. The user's choice wins; otherwise pure line works are exempt. */
export const isBcrExempt = (e: Estimate) => e.financials?.bcrExempt ?? isPureLineWorks(e);

/** True when the B/C ratio can be worked out: KPTCL inputs filled in, or benefits entered by hand. */
export function hasBcrInputs(f: Financials | undefined): boolean {
  if (!f) return false;
  if (f.method === 'kptcl') return (f.inputs?.addedMva ?? 0) > 0 || (f.inputs?.energySavingsMu ?? 0) > 0;
  return f.benefits.some((b) => b > 0);
}

export interface Financials {
  /**
   * 'kptcl' works the benefits out from the inputs below, the way the KPTCL BCR workbook does (as in the
   * Thyavanige DPR). 'manual' uses benefits typed or pasted in by hand. Older saved DPRs have no method and
   * are treated as manual.
   */
  method?: 'kptcl' | 'manual';
  /** Inputs for the KPTCL method. */
  inputs?: BcrInputs;
  /** Discount rate for B/C ratio and discounted payback, % per year (manual method). */
  discountRatePct: number;
  /** Benefit in each year of the analysis period, Rs lakh (manual method). */
  benefits: number[];
  /**
   * Set by the user to override the automatic rule that pure line works carry no BCR section or
   * annexure (ADR-0007). Not set means automatic.
   */
  bcrExempt?: boolean;
}

/** Inputs of the KPTCL BCR workbook, as printed on the DPR's BCR annexure. */
export interface BcrInputs {
  /** Net additional MVA on the station. */
  addedMva: number;
  /** Energy savings, MU per year (new stations only; usually 0). */
  energySavingsMu: number;
  /** ESCOM sale price of energy, Rs/unit, in year 1. */
  salePrice: number;
  /** KPTCL transmission charges, Rs/unit, in year 1. */
  transmissionCharge: number;
  /** Load growth, % per year. */
  loadGrowthPct: number;
  /** Discount rate, % per year. */
  discountRatePct: number;
  /** O&M cost, % of project cost per year. */
  omPct: number;
  /** Escalation on energy and transmission charges, % per year. */
  escalationPct: number;
  /**
   * Power factor and load factor that turn the added MVA into the energy the station can deliver
   * (MU = MVA × pf × lf × 8760 / 1000). 0.85 × 0.41 reproduces the Thyavanige DPR's 61.057 MU for 20 MVA.
   */
  powerFactor: number;
  loadFactor: number;
}

export const DEFAULT_BCR_INPUTS: BcrInputs = {
  addedMva: 0,
  energySavingsMu: 0,
  // FY values from the KPTCL BCR calculator (12-09-2026). They are fixed each financial year.
  salePrice: 9.54,
  transmissionCharge: 0.744,
  loadGrowthPct: 8,
  discountRatePct: 9,
  omPct: 1,
  escalationPct: 3,
  powerFactor: 0.85,
  loadFactor: 0.41,
};

export const DEFAULT_FINANCIALS: Financials = { method: 'kptcl', inputs: DEFAULT_BCR_INPUTS, discountRatePct: 10, benefits: [] };
export const ANALYSIS_YEARS = 30;

/** One year of the KPTCL BCR schedule. Money in Rs lakh, energy in MU, charges in Rs/unit. */
export interface BcrYear {
  year: number;
  energyCharge: number;
  transmissionCharge: number;
  savings: number;
  additionalSaleMu: number;
  additionalSavings: number;
  income: number;
  cashFlow: number;
  discountFactor: number;
  discountedCashFlow: number;
  cumulative: number;
}

export interface BcrAppraisal {
  schedule: BcrYear[];
  /** Present value of the yearly net cash flows (income less O&M). */
  npvBenefits: number;
  /** Project cost plus the present value of O&M. */
  npvCapital: number;
  /** Minimum capital requirement: the deepest point of the cumulative discounted cash flow (the project cost unless early years run at a loss). */
  mcr: number;
  /** NPV ÷ MCR + 1. */
  bcrMethod1: number;
  /** NPV of benefits ÷ NPV of capital outflow: the B/C ratio the DPR quotes. */
  bcr: number;
  irr: number | null;
  /** First year in which the cumulative discounted cash flow turns positive. */
  payback: number | null;
  /** When the cumulative discounted cash flow crosses zero, in years with a fraction (e.g. 8.4), or null. */
  breakEven: number | null;
  totalIncome: number;
  /** Energy the added MVA can deliver at full load, MU per year. */
  capacityMu: number;
}

/**
 * The KPTCL BCR workbook's method, reverse-checked against the Thyavanige DPR (20 MVA, Rs 1231.59 lakh →
 * B/C 3.46, IRR 22%, payback 9 years). Additional energy sold grows with the load-growth rate until the
 * added capacity is used up; the benefit to KPTCL is the transmission charge on that energy, plus the sale
 * price on any energy saved. Charges escalate each year; O&M is a flat share of the project cost.
 */
export function kptclAppraisal(cost: number, i: BcrInputs, years = ANALYSIS_YEARS): BcrAppraisal | null {
  if (cost <= 0) return null;
  const g = i.loadGrowthPct / 100;
  const d = i.discountRatePct / 100;
  const esc = i.escalationPct / 100;
  const om = (cost * i.omPct) / 100;
  const capacityMu = (i.addedMva * i.powerFactor * i.loadFactor * 8760) / 1000;
  const schedule: BcrYear[] = [];
  let cumulative = -cost;
  let npvBenefits = 0;
  let omPv = 0;
  let totalIncome = 0;
  for (let n = 1; n <= years; n++) {
    const f = (1 + esc) ** (n - 1);
    const energyCharge = i.salePrice * f;
    const transmissionCharge = i.transmissionCharge * f;
    // 1 MU at Rs 1/unit = Rs 10 lakh.
    const savings = i.energySavingsMu * energyCharge * 10;
    const additionalSaleMu = Math.min(capacityMu, capacityMu * ((1 + g) ** n - 1));
    const additionalSavings = additionalSaleMu * transmissionCharge * 10;
    const income = savings + additionalSavings;
    const cashFlow = income - om;
    const discountFactor = 1 / (1 + d) ** n;
    const discountedCashFlow = cashFlow * discountFactor;
    cumulative += discountedCashFlow;
    npvBenefits += discountedCashFlow;
    omPv += om * discountFactor;
    totalIncome += income;
    schedule.push({ year: n, energyCharge, transmissionCharge, savings, additionalSaleMu, additionalSavings, income, cashFlow, discountFactor, discountedCashFlow, cumulative });
  }
  const npvCapital = cost + omPv;
  // As in the KPTCL BCR calculator: MCR is the trough of the cumulative DCF, and break-even is interpolated
  // within the year the cumulative DCF turns positive.
  const cums = [-cost, ...schedule.map((y) => y.cumulative)];
  const mcr = -Math.min(...cums);
  let breakEven: number | null = null;
  for (let n = 1; n < cums.length - 1; n++) {
    if (cums[n]! < 0 && cums[n + 1]! >= 0) {
      breakEven = n + cums[n]! / (cums[n]! - cums[n + 1]!);
      break;
    }
  }
  return {
    schedule,
    npvBenefits,
    npvCapital,
    mcr,
    bcrMethod1: (npvBenefits - cost) / mcr + 1,
    breakEven,
    bcr: npvBenefits / npvCapital,
    irr: internalRateOfReturn(cost, schedule.map((y) => y.cashFlow)),
    payback: schedule.find((y) => y.cumulative >= 0)?.year ?? null,
    totalIncome,
    capacityMu,
  };
}

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

/** BCR, IRR and payback by whichever method the DPR uses. For the KPTCL method both paybacks are the discounted one. */
export function summariseFinancials(cost: number, f: Financials): FinancialSummary {
  if (f.method === 'kptcl') {
    const a = kptclAppraisal(cost, f.inputs ?? DEFAULT_BCR_INPUTS);
    const ok = a && (f.inputs?.addedMva ?? 0) + (f.inputs?.energySavingsMu ?? 0) > 0;
    return { bcr: ok ? a.bcr : null, irr: ok ? a.irr : null, payback: ok ? a.payback : null, discountedPayback: ok ? a.payback : null };
  }
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

/** MVA named in the DPR's capacity, e.g. "1x20 MVA" → 20, "2×12.5 MVA" → 25. Null when it can't be read. */
export function mvaFromCapacity(capacity: string): number | null {
  const m = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*MVA/i.exec(capacity);
  if (m) return Number(m[1]) * Number(m[2]);
  const one = /(\d+(?:\.\d+)?)\s*MVA/i.exec(capacity);
  return one ? Number(one[1]) : null;
}
