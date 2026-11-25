import type { StatedAbstract } from '@/features/boq-import/types';
import { abstractOf, hasLineWorks, sectionTotals, type TotalKey } from '@/features/preparation/calc';
import { isBcrExempt, mvaFromCapacity } from '@/features/preparation/finance';
import { loadFigures } from '@/features/preparation/load';
import type { Estimate, EstimateLine } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import type { DprContent } from './content';

/** A place where two parts of the DPR disagree. Blockers keep the DPR a draft until fixed or acknowledged. */
export interface CrossCheck {
  /** Stable id, so an acknowledgement survives re-renders. */
  id: string;
  severity: 'blocker' | 'warning';
  message: string;
  step: 'inputs' | 'estimate' | 'finance' | 'text';
  /** The data-fix anchor of the field to change, on that step. */
  target?: string;
  /** What to do about it, in plain words. */
  how: string;
}

/** A blocker the user has seen and accepted, with why. Tied to the message, so a new mismatch needs a new note. */
export interface Acknowledgement {
  message: string;
  note: string;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Every "N MVA" rating in a text, e.g. "16/20 MVA" → [16, 20], "1x20 MVA" → [20]. */
export function mvaRatings(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/((?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?)\s*MVA/gi)) {
    for (const n of m[1]!.split('/')) out.push(Number(n.replace(/^.*[x×]\s*/i, '').trim()));
  }
  return out.filter((n) => n > 0);
}

/** Per-unit rating in a capacity like "2x20 MVA" (20), or the single rating. */
function unitMva(capacity: string): number | null {
  const m = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*MVA/i.exec(capacity);
  if (m) return Number(m[2]);
  const one = /(\d+(?:\.\d+)?)\s*MVA/i.exec(capacity);
  return one ? Number(one[1]) : null;
}

function unitCount(capacity: string): number {
  const m = /(\d+)\s*[x×]\s*\d/i.exec(capacity);
  return m ? Number(m[1]) : 1;
}

/** Highest voltage named in a text, kV: "66/11 kV" → 66, "110 kV" → 110. */
export function highestKv(text: string): number | null {
  const all: number[] = [];
  for (const m of text.matchAll(/((?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?)\s*kV/gi)) for (const n of m[1]!.split('/')) all.push(Number(n));
  return all.length ? Math.max(...all) : null;
}

const isTransformer = (d: string) => /power\s+transformer|\bPT\b.*MVA|MVA.*transformer/i.test(d) && !/spare|oil only|bushing/i.test(d);

/**
 * Checks that the DPR says the same thing everywhere: the capacity and voltage it was initialised with,
 * the transformers priced in the estimate, the facts written for section 01, the BCR inputs, the load
 * data, and the totals stated on the workbook's own abstract sheets.
 */
export function crossChecks(dpr: DprRow, e: Estimate, content: DprContent, abstracts: StatedAbstract[] = []): CrossCheck[] {
  const out: CrossCheck[] = [];
  const unit = unitMva(dpr.capacity);
  const total = mvaFromCapacity(dpr.capacity);
  const kv = highestKv(dpr.voltage);

  // 1. Transformers priced in Part A.
  const pts = e.lines.filter((l) => l.section === 'electrical' && isTransformer(l.description));
  for (const l of pts) {
    const r = mvaRatings(l.description);
    if (unit && r.length && !r.includes(unit)) {
      out.push({ id: `pt-mva:${l.id}`, severity: 'blocker', step: 'estimate', message: `Item ${l.code || '?'} prices a ${r.join('/')} MVA transformer, but the DPR is for ${dpr.capacity}.`, target: `line:${l.id}`, how: `Change item ${l.code || '?'} to a ${unit} MVA transformer (description and rate), or, if the DPR capacity is the wrong one, correct it in DPR Initialization. If both are right (e.g. a replacement), press “It is correct…” on the Generate DPR step and say why.` });
    }
    const hv = highestKv(l.description);
    if (kv && hv && hv !== kv) {
      out.push({ id: `pt-kv:${l.id}`, severity: 'blocker', step: 'estimate', message: `Item ${l.code || '?'} is a ${hv} kV transformer, but the DPR is for ${dpr.voltage}.`, target: `line:${l.id}`, how: `Correct the voltage ratio in item ${l.code || '?'} to ${dpr.voltage}, or correct the DPR voltage in DPR Initialization.` });
    }
  }
  const ptQty = pts.filter((l) => !unit || mvaRatings(l.description).includes(unit)).reduce((s, l) => s + l.qty, 0);
  if (unit && pts.length && ptQty > 0 && ptQty !== unitCount(dpr.capacity)) {
    out.push({ id: 'pt-qty', severity: 'warning', step: 'estimate', message: `The estimate has ${fmt(ptQty)} transformers of ${unit} MVA; the DPR capacity ${dpr.capacity} means ${unitCount(dpr.capacity)}.`, target: `line:${pts[0]!.id}`, how: `Set the transformer quantity to ${unitCount(dpr.capacity)}, or correct the DPR capacity in DPR Initialization.` });
  }

  // 2. Facts written for section 01.
  const written: [string, string, string | undefined][] = [
    ['Name of work', 'nameOfWork', content.details.nameOfWork],
    ['MVA added', 'mvaAdded', content.details.mvaAdded],
  ];
  for (const [label, key, text] of written) {
    const r = text ? mvaRatings(text) : [];
    if (unit && r.length && !r.includes(unit) && !(total && r.includes(total))) {
      out.push({ id: `text-mva:${label}`, severity: 'blocker', step: 'text', message: `“${label}” mentions ${r.join(', ')} MVA, but the DPR is for ${dpr.capacity}.`, target: `detail:${key}`, how: `Change the MVA rating in “${label}” to ${dpr.capacity}. If ${r.join(', ')} MVA is right, the DPR capacity is wrong: correct it in DPR Initialization.` });
    }
  }

  // 3. BCR inputs (none for pure line works, ADR-0007).
  const added = !isBcrExempt(e) && e.financials?.method !== 'manual' ? e.financials?.inputs?.addedMva ?? 0 : 0;
  if (total && added > total + 0.01) {
    out.push({ id: 'bcr-mva', severity: 'blocker', step: 'finance', message: `The BCR assumes ${fmt(added)} MVA added, more than the DPR's ${dpr.capacity}.`, target: 'bcr:addedMva', how: `Lower “Additional load after enhancement” to at most ${fmt(total)} MVA (the net MVA this work adds).` });
  }
  const load = loadFigures(e.load, dpr.capacity);
  if (load && added > 0 && Math.abs(load.addedMva - added) > 0.01) {
    out.push({ id: 'bcr-load', severity: 'warning', step: 'finance', message: `The load data gives ${fmt(load.addedMva)} MVA added; the BCR uses ${fmt(added)} MVA.`, target: 'bcr:addedMva', how: `Set “Additional load after enhancement” to ${fmt(load.addedMva)} MVA (the Load data card has a button for it), or correct the load data if that figure is wrong.` });
  }
  if (load && load.after > 1) {
    out.push({ id: 'load-after', severity: 'warning', step: 'finance', message: `Even after the work the loading factor is ${load.after.toFixed(2)}: the added capacity does not cover the recorded peak.`, target: 'load', how: 'Check the peak load, power factor and capacities in Load data. If they are right, nothing needs changing, but the report text should not claim the overload is fully relieved.' });
  }

  // 4. Totals stated on the workbook's abstract sheets.
  out.push(...abstractChecks(e, abstracts));

  // 5. The estimate's own arithmetic.
  out.push(...estimateChecks(e));
  return out;
}

/** Each abstract against the total the workbook's own abstract sheet states (the largest per part, as on import). */
export function abstractChecks(e: Estimate, abstracts: StatedAbstract[]): CrossCheck[] {
  const out: CrossCheck[] = [];
  const parts: StatedAbstract['part'][] = hasLineWorks(e) ? ['I', 'line'] : ['I'];
  if (e.lines.some((l) => l.section === 'dismantling')) parts.push('II');
  for (const part of parts) {
    const stated = abstracts.filter((a) => a.part === part && a.total).sort((a, b) => b.total! - a.total!)[0];
    if (!stated) continue;
    const statedLakh = stated.total! / 1e5;
    const ours = abstractOf(e, part).find((r) => r.key === 'total')!.lakhs;
    // Both are shown to 0.01 lakh (Rs 1,000), so anything more than that apart is a real difference.
    if (Math.abs(statedLakh - ours) > 0.0105) {
      const name = part === 'line' ? 'Line works' : `Abstract-${part}`;
      out.push({
        id: `abstract:${part}`,
        severity: 'blocker',
        step: 'estimate',
        message: `${name} comes to ${fmt(ours)} lakh, but “${stated.sheet.trim()}” in the workbook states ${fmt(statedLakh)} lakh (difference ${fmt(ours - statedLakh)} lakh).`,
        target: `abstract:${part}`,
        how: `Usually an item was left out or a rate changed at import. Upload the BOQ workbook again and import it with “Replace”, then compare. If the workbook’s own sheet is wrong (e.g. a formula skips rows), press “It is correct…” on the Generate DPR step and note why.`,
      });
    }
  }
  return out;
}

const MISC_LABEL: Record<TotalKey, string> = {
  supply: 'Part A supply',
  erection: 'Part A erection',
  testing: 'Part A T&C',
  civil: 'Part B civil',
  dismantling: 'Dismantling',
  lineSupply: 'Line supply',
  lineErection: 'Line erection',
  lineTesting: 'Line T&C',
  lineCivil: 'Line civil',
};

/**
 * Mistakes inside the estimate itself: rows imported twice, a "Miscellaneous" amount that is negative or
 * out of all proportion to the items, and quantities that are not whole numbers where only whole ones
 * make sense. (Items with no rate are already on the checklist.)
 */
export function estimateChecks(e: Estimate): CrossCheck[] {
  const out: CrossCheck[] = [];
  // The same file row twice: the usual cause is importing the BOQ again with "Add to the estimate".
  const bySource = new Map<string, EstimateLine[]>();
  for (const l of e.lines) {
    // Only rows read from a file carry a "sheet row N" source; template lines all share one source.
    if (!l.source || !/ row \d+/.test(l.source)) continue;
    const key = `${l.section}|${l.source}`;
    bySource.set(key, [...(bySource.get(key) ?? []), l]);
  }
  const doubled = [...bySource.values()].filter((ls) => ls.length > 1);
  if (doubled.length) {
    const first = doubled[0]![0]!;
    out.push({
      id: 'dup-rows',
      severity: 'blocker',
      step: 'estimate',
      target: `line:${doubled[0]![1]!.id}`,
      how: 'Delete the highlighted copy (bin icon at the end of the row) and any other repeated rows, or upload the BOQ again and import it with “Replace”.',
      message: `${doubled.length} BOQ ${doubled.length === 1 ? 'row is' : 'rows are'} in the estimate more than once (e.g. ${first.code || first.description.slice(0, 40)}, from ${first.source}). Remove the copies, or import the BOQ again with “Replace”.`,
    });
  }

  const { subTotal, total } = sectionTotals(e);
  for (const key of Object.keys(MISC_LABEL) as TotalKey[]) {
    const misc = e.misc[key] ?? 0;
    if (misc < 0) {
      out.push({ id: `misc-neg:${key}`, severity: 'blocker', step: 'estimate', message: `${MISC_LABEL[key]}: “Miscellaneous” is negative (Rs ${fmt(misc)}), which takes Rs ${fmt(-misc)} off the items.`, target: `misc:${key}`, how: 'Set this “Miscellaneous” amount to 0 or to the small positive round-off from the workbook. A negative amount usually means items were dropped at import.' });
    } else if (misc > 0 && subTotal[key] > 0 && misc > subTotal[key] * 0.05) {
      out.push({
        id: `misc-big:${key}`,
        severity: 'warning',
        step: 'estimate',
        message: `${MISC_LABEL[key]}: “Miscellaneous” is Rs ${fmt(misc)}, ${fmt((misc / subTotal[key]) * 100)}% of the items (Rs ${fmt(subTotal[key])}). It is usually a small round-off to Rs ${fmt(total[key])}.`,
        target: `misc:${key}`,
        how: 'Check this amount against the workbook. If items were left out at import, import the BOQ again with “Replace”; otherwise lower it to the round-off.',
      });
    } else if (misc > 0 && subTotal[key] === 0) {
      out.push({ id: `misc-alone:${key}`, severity: 'warning', step: 'estimate', message: `${MISC_LABEL[key]}: “Miscellaneous” Rs ${fmt(misc)} is set, but there are no items in that part.`, target: `misc:${key}`, how: 'Set it to 0, or add the items this amount belongs to.' });
    }
  }

  const fractional = e.lines.filter((l) => /^(no|nos|no's|set|sets|each)\.?$/i.test(l.unit.trim()) && Math.abs(l.qty - Math.round(l.qty)) > 1e-9);
  if (fractional.length) {
    const l = fractional[0]!;
    out.push({ id: 'qty-fraction', severity: 'warning', step: 'estimate', target: `line:${l.id}`, how: `Make the quantity a whole number, or change the unit if it is really measured in km, MT or metres.`, message: `${fractional.length} ${fractional.length === 1 ? 'item is' : 'items are'} counted in ${l.unit} but ${fractional.length === 1 ? 'has' : 'have'} a part quantity (e.g. ${l.code || l.description.slice(0, 40)}: ${l.qty}).` });
  }

  // The same item (same part, heading, wording and unit) at two supply rates. None of 21 KPTCL estimate
  // workbooks does this, so it is almost always a typing or copying slip.
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const sameItem = new Map<string, EstimateLine[]>();
  for (const l of e.lines) {
    if (!(l.supplyRate > 0) || !l.description.trim()) continue;
    const key = [l.section, norm(l.group ?? ''), norm(l.description), norm(l.unit)].join('|');
    sameItem.set(key, [...(sameItem.get(key) ?? []), l]);
  }
  for (const ls of sameItem.values()) {
    const rates = [...new Set(ls.map((l) => l.supplyRate))];
    if (rates.length < 2) continue;
    const l = ls[0]!;
    out.push({
      id: `rate-mismatch:${l.section}:${norm(l.description).slice(0, 60)}`,
      severity: 'warning',
      step: 'estimate',
      message: `“${l.description.slice(0, 60)}” (${l.unit}) appears ${ls.length} times at different supply rates: ${rates.map((r) => `Rs ${fmt(r)}`).join(', ')}.`,
      target: `line:${ls.find((x) => x.supplyRate !== l.supplyRate)!.id}`,
      how: 'Give every copy of this item the same supply rate (the right one from the schedule of rates), or reword one if they really are different items.',
    });
  }
  return out;
}

/** Blockers not yet acknowledged, or acknowledged for a different message. */
export function openBlockers(checks: CrossCheck[], acks: Record<string, Acknowledgement> = {}): CrossCheck[] {
  return checks.filter((c) => c.severity === 'blocker' && acks[c.id]?.message !== c.message);
}
