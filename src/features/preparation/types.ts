import type { DprContent } from '@/features/dpr-document/content';
import type { Financials } from './finance';

/** Part A electrical and Part B civil make Abstract-I; dismantling (brownfield only) makes Abstract-II. */
export type EstimateSection = 'electrical' | 'civil' | 'dismantling';

/** One BOQ line. Electrical lines use all three rates; civil and dismantling lines use only `supplyRate` as the rate. */
export interface EstimateLine {
  id: string;
  section: EstimateSection;
  code: string;
  description: string;
  unit: string;
  qty: number;
  /** Rs per unit */
  supplyRate: number;
  erectionRate: number;
  testingRate: number;
  /** Where the line came from when imported, e.g. "boq.xlsx · Sheet1 row 12". */
  source?: string;
}

export interface Estimate {
  lines: EstimateLine[];
  /** "Miscellaneous and unforeseen" / rounding amounts in Rs, as on the estimate sheets. */
  misc: { supply: number; erection: number; testing: number; civil: number; dismantling?: number };
  /** Area-specific loading on the basic rate, % (5 in the sample). */
  areaLoadingPct: number;
  /** GST on basic rate + loading, % (18 in the sample). */
  gstPct: number;
  /** PTCC, inspectorate, forest, compensation etc., Rs. */
  statutoryCharges: number;
  /** Statutory charges on the dismantling estimate (Abstract-II), Rs. 0 in the sample. */
  dismantlingStatutory?: number;
  /** Yearly benefits and discount rate for B/C ratio, IRR and payback. */
  financials?: Financials;
  /** Text and project details for the Word DPR. */
  document?: DprContent;
  /** Capacity the template was built for, so we can tell when the DPR changed. */
  templateCapacity: string;
  updatedAt: string;
}
