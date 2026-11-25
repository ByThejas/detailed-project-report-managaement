import { SECTION_KEYS, lineAmounts } from '@/features/preparation/calc';
import { TEMPLATE_CHARGES, TEMPLATE_SOURCE, newLine } from '@/features/preparation/template';
import { isMultiRate, type Estimate, type EstimateLine, type EstimateSection } from '@/features/preparation/types';
import type { BoqReadResult, ParsedItem, StatedAbstract } from './types';
import { itemAmount } from './parse';

/** BOQ part a sheet's items go to: the sheet's own (from its name), else the document's. */
export const sectionOfItem = (item: Pick<ParsedItem, 'sheet'>, read: BoqReadResult): EstimateSection =>
  read.sheets.find((s) => s.name === item.sheet)?.section ?? read.section;

/** A reviewed item as a BOQ line, remembering the file and row it came from. */
export function toEstimateLine(item: ParsedItem, read: BoqReadResult, imported?: Set<string>, carried: ParsedItem['headings'] = []): EstimateLine {
  const section = sectionOfItem(item, read);
  const multi = isMultiRate(section);
  const where = `${read.fileName} · ${item.sheet} row ${item.row}`;
  const qty = item.qty ?? 0;
  const oneRate = item.supplyRate + item.erectionRate + item.testingRate;
  // The file's amounts go with the line, so it shows them even where they are not qty × rate.
  let fileAmounts: EstimateLine['fileAmounts'];
  if (item.fileAmounts && Object.keys(item.fileAmounts).length) {
    if (multi) fileAmounts = { ...item.fileAmounts };
    else {
      const amount = (['supply', 'erection', 'testing'] as const).reduce((s, k) => s + itemAmount(item, k), 0);
      fileAmounts = { supply: { qty, rate: oneRate, amount } };
    }
  }
  // Heading rows above the item, as the file prints them. One the user chose to import as an item itself is left out.
  const headings = [...carried, ...(item.headings ?? [])].filter((h) => !imported?.has(`${item.sheet}|${h.row}`)).map(({ code, text }) => ({ code, text }));
  // The description is the file's own; the heading of a sub-item ("a)") is printed above it and kept for matching.
  const group = [...new Set([item.group, item.heading].filter((h): h is string => Boolean(h)))].join(' · ');
  return {
    ...newLine(section, item.code),
    description: item.description,
    unit: item.unit,
    qty,
    // Civil and dismantling have one rate. A dismantling sheet keeps it under "Labour cost" or "Erection", so
    // whatever rates the row has are added into that one rate rather than dropped.
    supplyRate: multi ? item.supplyRate : oneRate,
    erectionRate: multi ? item.erectionRate : 0,
    testingRate: multi ? item.testingRate : 0,
    source: item.srRef ? `${where} · SR ${item.srRef}` : where,
    ...(item.srCode ? { srCode: item.srCode } : {}),
    ...(group ? { group } : {}),
    ...(fileAmounts ? { fileAmounts } : {}),
    ...(headings.length ? { headings } : {}),
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
  /** Ways the import will not come to the totals stated in the file, for the review screen. */
  warnings: string[];
}

const LABEL: Record<EstimateSection, string> = {
  electrical: 'Part A',
  civil: 'Part B',
  dismantling: 'Dismantling',
  line: 'Line supply & erection',
  lineCivil: 'Line civil',
};
export const sectionLabel = (s: EstimateSection) => LABEL[s];

const r2 = (n: number) => Math.round(n * 100) / 100;
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
  const imported = new Set(items.map((i) => `${i.sheet}|${i.row}`));
  // Heading rows above an item that is not imported go above the next imported item of its sheet, so they are not lost.
  const chosen = new Set(items.map((i) => i.id));
  const carry = new Map<string, NonNullable<ParsedItem['headings']>>();
  const carried = new Map<string, NonNullable<ParsedItem['headings']>>();
  for (const i of read.items) {
    const left = carry.get(i.sheet) ?? [];
    if (!chosen.has(i.id)) carry.set(i.sheet, [...left, ...(i.headings ?? [])]);
    else if (left.length) {
      carried.set(i.id, left);
      carry.delete(i.sheet);
    }
  }
  const lines = items.map((i) => toEstimateLine(i, read, imported, carried.get(i.id)));
  const sections = [...new Set(lines.map((l) => l.section))];
  const misc: Partial<Misc> = {};
  const notes: string[] = [];
  const warnings: string[] = [];

  for (const m of read.misc ?? []) {
    if (!includedSheets.has(m.sheet)) continue;
    const section = read.sheets.find((s) => s.name === m.sheet)?.section ?? read.section;
    const keys = SECTION_KEYS[section];
    // One-rate parts (civil, dismantling) take a misc amount from any column into their one total.
    const key = m.column === 'supply' ? keys.supply : (keys[m.column] ?? (isMultiRate(section) ? undefined : keys.supply));
    if (!key) continue;
    let amount = Math.round(m.amount * 100) / 100;
    let note = '';
    if (m.statedTotal !== undefined) {
      const fromSheet = lines.filter((_, i) => items[i]!.sheet === m.sheet);
      const sub = fromSheet.reduce((s, l) => s + (isMultiRate(section) ? lineAmounts(l)[m.column] : lineAmounts(l).supply), 0);
      const plug = Math.round((m.statedTotal - sub) * 100) / 100;
      // The plug tops the items up to the sheet's round total. It may differ from the file's own amount only by
      // paise of rounding; more than that means items were left out or changed in the review, and topping up
      // would hide that change inside "Miscellaneous". So the file's own amount is kept and the total moves.
      if (Math.abs(plug - m.amount) <= 1) {
        amount = plug;
        note = `, bringing the total to Rs ${inr(m.statedTotal)} as in the file`;
      } else {
        note = `. The items imported come to Rs ${inr(r2(sub))}, not Rs ${inr(r2(m.statedTotal - m.amount))} as in the file, so the total is Rs ${inr(r2(sub + amount))} instead of the file's Rs ${inr(m.statedTotal)}`;
        warnings.push(`${m.sheet}: the ${m.column} total differs from the file by Rs ${inr(r2(sub + amount - m.statedTotal))}, because items were left out or changed in the review.`);
      }
    }
    if (amount < 0) warnings.push(`${m.sheet} row ${m.row} “${m.label}” is negative (Rs ${inr(amount)}): the file's total is less than its items.`);
    misc[key] = Math.round(((misc[key] ?? 0) + amount) * 100) / 100;
    // A part that gets a miscellaneous amount is being imported, even if every item of it was left out.
    if (!sections.includes(section)) sections.push(section);
    notes.push(`${m.sheet} row ${m.row} “${m.label}” (${m.column}): Rs ${inr(amount)}${note}`);
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
    // A line-only job has no Abstract-I: the template's statutory charge for it would add to the total.
    if (!ss && tl && !sections.some((s) => s === 'electrical' || s === 'civil')) charges.statutoryCharges = 0;
    if (tl && sections.some((s) => s === 'line' || s === 'lineCivil')) {
      charges.lineCharges = { statutory: tl.statutory ?? 0, forestCompensation: tl.forest ?? 0, landCompensation: tl.land ?? 0 };
      notes.push(`Line works charges from “${tl.sheet.trim()}”: statutory Rs ${inr(tl.statutory ?? 0)}, forest/tree/crop Rs ${inr(tl.forest ?? 0)}, land/corridor Rs ${inr(tl.land ?? 0)}`);
    }
  }
  return { lines, sections, misc, charges, notes, warnings };
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
  return dropPresets({ ...e, ...plan.charges, lines: [...kept, ...plan.lines], misc }, []);
}

const fromFile = (l: EstimateLine) => !!l.source && SOURCE.test(l.source);

/**
 * An estimate built from an uploaded workbook keeps nothing of the sample template: the sample's unedited items (in
 * parts the file has no items for, e.g. the sample Part A and dismantling under an uploaded line estimate) are dropped,
 * and the sample's area loading and statutory charge, where still in place, give way to the file's abstract (or nil
 * when the file states no statutory charge). Lines the user added or edited, and charges they typed, are kept.
 */
export function dropPresets(e: Estimate, reads: BoqReadResult[]): Estimate {
  if (!e.lines.some(fromFile)) return e;
  const lines = e.lines.filter((l) => l.source !== TEMPLATE_SOURCE);
  const next: Estimate = { ...e, lines };
  const pick = (part: StatedAbstract['part']) =>
    reads.flatMap((r) => r.abstracts ?? []).filter((a) => a.part === part).sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
  const ss = pick('I');
  const tl = pick('line');
  const pct = (ss ?? tl)?.areaLoadingPct;
  if (e.areaLoadingPct === TEMPLATE_CHARGES.areaLoadingPct && pct !== undefined) next.areaLoadingPct = pct;
  const gst = (ss ?? tl)?.gstPct;
  if (e.gstPct === TEMPLATE_CHARGES.gstPct && gst !== undefined) next.gstPct = gst;
  // The sample's Rs 50,000 is not the file's: the file's Abstract-I figure, or nil where the file states none.
  if (e.statutoryCharges === TEMPLATE_CHARGES.statutoryCharges && (ss?.statutory ?? 0) !== TEMPLATE_CHARGES.statutoryCharges) next.statutoryCharges = ss?.statutory ?? 0;
  const same =
    lines.length === e.lines.length && next.areaLoadingPct === e.areaLoadingPct && next.gstPct === e.gstPct && next.statutoryCharges === e.statutoryCharges;
  return same ? e : next;
}

const SOURCE = /^(.*) · (.+) row (\d+)(?: · |$)/;
const HEADING_ROW = /^No quantity \(heading or note\)$|^No description or quantity$|^Quantity column reads/;
const isHeading = (code: string, text: string) => Boolean(code) || (Boolean(text) && !/^\(?\s*notes?\b/i.test(text));

/**
 * Lines imported before heading rows were kept get them back from the file's reading saved with the DPR: the rows
 * with no quantity between the line and the imported line above it (after any total row), as the file prints them.
 * The heading that was joined onto a sub-item's description ("Heading — a) item") is taken off it again.
 */
export function addFileHeadings(e: Estimate, reads: BoqReadResult[]): Estimate {
  if (!reads.length || e.lines.every((l) => l.headings || !l.source)) return e;
  const at = (l: EstimateLine) => {
    const m = l.source ? SOURCE.exec(l.source) : null;
    return m ? { file: m[1]!, sheet: m[2]!, row: Number(m[3]) } : null;
  };
  const imported = new Map<string, number[]>();
  for (const l of e.lines) {
    const p = at(l);
    if (p) imported.set(`${p.file}|${p.sheet}`, [...(imported.get(`${p.file}|${p.sheet}`) ?? []), p.row]);
  }
  let changed = false;
  const lines = e.lines.map((l) => {
    const p = l.headings ? null : at(l);
    const read = p && reads.find((r) => r.fileName === p.file);
    if (!p || !read) return l;
    const rows = imported.get(`${p.file}|${p.sheet}`) ?? [];
    const above = Math.max(0, ...rows.filter((r) => r < p.row));
    const between = read.skipped.filter((s) => s.sheet === p.sheet && s.row > above && s.row < p.row).sort((a, b) => a.row - b.row);
    const lastTotal = Math.max(0, ...between.filter((s) => /^Total row/.test(s.reason)).map((s) => s.row));
    const headings = between
      .filter((s) => s.row > lastTotal && HEADING_ROW.test(s.reason) && !rows.includes(s.row))
      // A row with a Sl. No. and no description was saved with its cells joined as the description.
      .map((s) => ({ code: s.code, text: /^No description/.test(s.reason) ? '' : s.description }))
      .filter((h) => isHeading(h.code, h.text));
    if (!headings.length) return l;
    changed = true;
    const joined = headings.find((h) => h.text && l.description.startsWith(`${h.text} — `));
    return { ...l, headings, ...(joined ? { description: l.description.slice(joined.text.length + 3) } : {}) };
  });
  return changed ? { ...e, lines } : e;
}
