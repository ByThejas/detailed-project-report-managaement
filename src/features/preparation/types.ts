import type { DprContent } from '@/features/dpr-document/content';
import type { Financials } from './finance';
import type { LoadData } from './load';

/**
 * Part A electrical and Part B civil make Abstract-I (the substation); dismantling (brownfield only) makes
 * Abstract-II. Line works (e.g. a LILO line to the substation) have their own supply/labour and civil sheets
 * and their own abstract, as in the Thyavanige estimate.
 */
export type EstimateSection = 'electrical' | 'civil' | 'dismantling' | 'line' | 'lineCivil';

/** Sections priced with supply, erection and T&C rates. The others use only `supplyRate` as the rate. */
export const MULTI_RATE_SECTIONS: readonly EstimateSection[] = ['electrical', 'line'];
export const isMultiRate = (s: EstimateSection) => MULTI_RATE_SECTIONS.includes(s);

/** Statutory charges and compensation on a line-works abstract, Rs. */
export interface LineWorksCharges {
  /** PTCC, Electrical Inspectorate etc. */
  statutory: number;
  /** Forest clearance, tree and crop cut compensation. */
  forestCompensation: number;
  /** Land, corridor and tower-foot area compensation. */
  landCompensation: number;
}

/** One BOQ line. Multi-rate sections use all three rates; the others use only `supplyRate` as the rate. */
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
  /** Schedule-of-rates item the rates were taken from, e.g. "SoR 2023-24 · By code 1.10 · p25". */
  rateRef?: string;
  /** SoR labour or T&C rates left out when pricing, because their unit needs a basis (per Set, per tonne…). */
  labourNotAdded?: string;
  /** SoR item code the BOQ itself names (an "SR Code" column), used to take that exact catalog item. */
  srCode?: string;
  /** Headings the line sits under in the BOQ ("Fabrication and supply of towers"), used only to match it to the rate catalog. */
  group?: string;
}

export interface Estimate {
  lines: EstimateLine[];
  /** "Miscellaneous and unforeseen" / rounding amounts in Rs, as on the estimate sheets. */
  misc: {
    supply: number;
    erection: number;
    testing: number;
    civil: number;
    dismantling?: number;
    lineSupply?: number;
    lineErection?: number;
    lineTesting?: number;
    lineCivil?: number;
  };
  /** Area-specific loading on the basic rate, % (5 in the Kogali sample, 3 in Thyavanige). */
  areaLoadingPct: number;
  /** GST on basic rate + loading, % (18 in the sample). */
  gstPct: number;
  /** PTCC, inspectorate etc. on Abstract-I, Rs. */
  statutoryCharges: number;
  /** Forest / tree / crop compensation on Abstract-I, Rs. Usually 0 for a substation. */
  forestCompensation?: number;
  /** Land / corridor / tower-foot compensation on Abstract-I, Rs. */
  landCompensation?: number;
  /** Charges on the line-works abstract. */
  lineCharges?: LineWorksCharges;
  /** Statutory charges on the dismantling estimate (Abstract-II), Rs. 0 in the sample. */
  dismantlingStatutory?: number;
  /** Yearly benefits and discount rate for B/C ratio, IRR and payback. */
  financials?: Financials;
  /** Recorded load at the station, for the loading factor and the BCR's added MVA. */
  load?: LoadData;
  /** Text and project details for the Word DPR. */
  document?: DprContent;
  /** Capacity the template was built for, so we can tell when the DPR changed. */
  templateCapacity: string;
  updatedAt: string;
}
