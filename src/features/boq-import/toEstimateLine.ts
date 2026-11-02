import { SECTION_KEYS, lineAmounts } from '@/features/preparation/calc';
import { newLine } from '@/features/preparation/template';
import { isMultiRate, type Estimate, type EstimateLine, type EstimateSection } from '@/features/preparation/types';
import type { BoqReadResult, ParsedItem, StatedAbstract } from './types';

/** BOQ part a sheet's items go to: the sheet's own (from its name), else the document's. */
export const sectionOfItem = (item: Pick<ParsedItem, 'sheet'>, read: BoqReadResult): EstimateSection =>
  read.sheets.find((s) => s.name === item.sheet)?.section ?? read.section;

/** A reviewed item as a BOQ line, remembering the file and row it came from. */
export function toEstimateLine(item: ParsedItem, read: BoqReadResult): EstimateLine {
  const section = sectionOfItem(item, read);
  const multi = isMultiRate(section);
  const where = `${read.fileName} · ${item.sheet} row ${item.row}`;
  return {
    ...newLine(section, item.code),
    description: item.heading ? `${item.heading} — ${item.description}` : item.description,
    unit: item.unit,
    qty: item.qty ?? 0,
    supplyRate: item.supplyRate,
    erectionRate: multi ? item.erectionRate : 0,
    testingRate: multi ? item.testingRate : 0,
    source: item.srRef ? `${where} · SR ${item.srRef}` : where,
    ...(item.srCode ? { srCode: item.srCode } : {}),
  };
}

type Misc = Estimate['misc'];
type Charges = Pick<Estimate, 'areaLoadingPct' | 'gstPct' | 'statutoryCharges' | 'forestCompensation' | 'landCompensation' | 'lineCharges'>;

export interface ImportPlan {
  lines: EstimateLine[];
  /** BOQ parts the lines go to; "replace" clears only these. */
  sections: EstimateSection[];
  /** Miscellaneous amounts that bring each part to the total stated in the file. */
  misc: Partial<Misc>;
  /** Percentages and charges read off the workbook's abstract sheets. */
  charges: Partial<Charges>;
  /** What was carried over besides the lines, in words, for the review screen. */
  notes: string[];
}

const LABEL: Record<EstimateSection, string> = {
  electrical: 'Part A',
  civil: 'Part B',
  dismantling: 'Dismantling',
  line: 'Line supply & erection',
  lineCivil: 'Line civil',
};
export const sectionLabel = (s: EstimateSection) => LABEL[s];

const inr = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** The abstract to take charges from for a part: the largest one, since a workbook can also hold part-abstracts (I(a), I(b)). */
const abstractFor = (read: BoqReadResult, part: StatedAbstract['part']) =>
  (read.abstracts ?? []).filter((a) => a.part === part).sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];

/**
 * Works out what importing the chosen items does to the estimate. A sheet's "Miscellaneous" row tops it
 * up to a stated total, so the misc amount is recomputed as (stated total − the imported lines), which
 * keeps the total right even after a quantity is corrected in the review.
 */
export function planImport(read: BoqReadResult, items: ParsedItem[], includedSheets: Set<string>, withCharges = true): ImportPlan {
  const lines = items.map((i) => toEstimateLine(i, read));
  const sections = [...new Set(lines.map((l) => l.section))];
  const misc: Partial<Misc> = {};
  const notes: string[] = [];

  for (const m of read.misc ?? []) {
    if (!includedSheets.has(m.sheet)) continue;
    const section = read.sheets.find((s) => s.name === m.sheet)?.section ?? read.section;
    const keys = SECTION_KEYS[section];
    const key = m.column === 'supply' ? keys.supply : keys[m.column];
    if (!key) continue;
    let amount = m.amount;
    if (m.statedTotal !== undefined) {
      const fromSheet = lines.filter((_, i) => items[i]!.sheet === m.sheet);
      const sub = fromSheet.reduce((s, l) => s + lineAmounts(l)[m.column], 0);
      amount = Math.round((m.statedTotal - sub) * 100) / 100;
    }
    misc[key] = Math.round(((misc[key] ?? 0) + amount) * 100) / 100;
    notes.push(`${m.sheet} row ${m.row} “${m.label}” (${m.column}): Rs ${inr(amount)}${m.statedTotal !== undefined ? `, bringing the total to Rs ${inr(m.statedTotal)} as in the file` : ''}`);
  }

  const charges: Partial<Charges> = {};
  if (withCharges) {
    const ss = abstractFor(read, 'I');
    const tl = abstractFor(read, 'line');
    const first = ss ?? tl;
    if (first?.areaLoadingPct !== undefined) {
      charges.areaLoadingPct = first.areaLoadingPct;
      notes.push(`Area loading ${first.areaLoadingPct}% and GST ${first.gstPct ?? 18}% (from “${first.sheet.trim()}”)`);
    }
    if (first?.gstPct !== undefined) charges.gstPct = first.gstPct;
    if (ss && sections.some((s) => s === 'electrical' || s === 'civil')) {
      if (ss.statutory !== undefined) charges.statutoryCharges = ss.statutory;
      charges.forestCompensation = ss.forest ?? 0;
      charges.landCompensation = ss.land ?? 0;
      notes.push(`Abstract-I charges from “${ss.sheet.trim()}”: statutory Rs ${inr(ss.statutory ?? 0)}, compensation Rs ${inr((ss.forest ?? 0) + (ss.land ?? 0))}`);
    }
    if (tl && sections.some((s) => s === 'line' || s === 'lineCivil')) {
      charges.lineCharges = { statutory: tl.statutory ?? 0, forestCompensation: tl.forest ?? 0, landCompensation: tl.land ?? 0 };
      notes.push(`Line works charges from “${tl.sheet.trim()}”: statutory Rs ${inr(tl.statutory ?? 0)}, forest/tree/crop Rs ${inr(tl.forest ?? 0)}, land/corridor Rs ${inr(tl.land ?? 0)}`);
    }
  }
  return { lines, sections, misc, charges, notes };
}

export type ImportMode = 'replace' | 'append';

/** The estimate after an import. "replace" swaps out the lines and misc amounts of the parts being imported. */
export function applyImport(e: Estimate, plan: ImportPlan, mode: ImportMode): Estimate {
  const kept = mode === 'replace' ? e.lines.filter((l) => !plan.sections.includes(l.section)) : e.lines;
  const misc: Misc = { ...e.misc };
  if (mode === 'replace') {
    for (const section of plan.sections) for (const key of Object.values(SECTION_KEYS[section])) misc[key] = 0;
  }
  for (const [k, v] of Object.entries(plan.misc) as [keyof Misc, number][]) misc[k] = mode === 'replace' ? v : (misc[k] ?? 0) + v;
  return { ...e, ...plan.charges, lines: [...kept, ...plan.lines], misc };
}
