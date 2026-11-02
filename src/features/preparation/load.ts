import { mvaFromCapacity } from './finance';

/** Recorded load at the station, from the Transformer & Feeder Load Details. */
export interface LoadData {
  /** Existing transformers, e.g. "1x12.5 MVA" or "2x8 MVA". */
  existing: string;
  /** Recorded peak load, MW. */
  peakMw: number;
  /** Capacity taken out by the work (a replacement), MVA. 0 for an additional transformer. */
  replacedMva: number;
  powerFactor: number;
}

export const EMPTY_LOAD: LoadData = { existing: '', peakMw: 0, replacedMva: 0, powerFactor: 0.85 };

/** Loading factor as KPTCL works it out: peak MW ÷ (MVA × power factor). Thyavanige: 10.6 ÷ (12.5 × 0.85) = 0.99. */
export const loadingFactor = (mw: number, mva: number, pf: number) => (mva > 0 && pf > 0 ? mw / (mva * pf) : 0);

export interface LoadFigures {
  existingMva: number;
  newMva: number;
  afterMva: number;
  addedMva: number;
  now: number;
  after: number;
}

/** Loading now and after the work. Null until the existing capacity and peak load are entered. */
export function loadFigures(load: LoadData | undefined, capacity: string): LoadFigures | null {
  if (!load || !load.peakMw) return null;
  const existingMva = mvaFromCapacity(load.existing) ?? 0;
  if (!existingMva) return null;
  const newMva = mvaFromCapacity(capacity) ?? 0;
  const afterMva = existingMva - load.replacedMva + newMva;
  return {
    existingMva,
    newMva,
    afterMva,
    addedMva: newMva - load.replacedMva,
    now: loadingFactor(load.peakMw, existingMva, load.powerFactor),
    after: loadingFactor(load.peakMw, afterMva, load.powerFactor),
  };
}

/** Two decimals, cut not rounded, as the DPRs show it (10.6 ÷ 10.625 = 0.9976 → 0.99). */
export const lf2 = (x: number) => (Math.floor(x * 100 + 1e-9) / 100).toFixed(2);

const status = (f: number) => (f >= 0.9 ? 'overloaded' : f >= 0.75 ? 'heavily loaded' : 'within capacity');

/** The "Existing capacity" fact in section 01, worded as in the Thyavanige DPR. */
export function existingCapacityText(load: LoadData, voltage: string, f: LoadFigures): string {
  const kv = voltage.includes('/') ? `, ${voltage}` : '';
  return `${load.existing.replace(/\s*x\s*/i, '×')}${kv} — recorded peak load ${load.peakMw} MW, loading factor ${lf2(f.now)} (${status(f.now)})`;
}

export function mvaAddedText(capacity: string, voltage: string, f: LoadFigures): string {
  const kv = voltage.includes('/') ? `, ${voltage}` : '';
  return `${f.addedMva} MVA (${capacity.replace(/\s*x\s*/i, '×')}${kv}); loading factor after the work ${lf2(f.after)}.`;
}
