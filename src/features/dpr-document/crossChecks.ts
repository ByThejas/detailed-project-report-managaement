import type { StatedAbstract } from '@/features/boq-import/types';
import { abstractOf, hasLineWorks } from '@/features/preparation/calc';
import { mvaFromCapacity } from '@/features/preparation/finance';
import { loadFigures } from '@/features/preparation/load';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import type { DprContent } from './content';

/** A place where two parts of the DPR disagree. Blockers keep the DPR a draft until fixed or acknowledged. */
export interface CrossCheck {
  /** Stable id, so an acknowledgement survives re-renders. */
  id: string;
  severity: 'blocker' | 'warning';
  message: string;
  step: 'inputs' | 'estimate' | 'finance' | 'text';
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
      out.push({ id: `pt-mva:${l.id}`, severity: 'blocker', step: 'estimate', message: `Item ${l.code || '?'} prices a ${r.join('/')} MVA transformer, but the DPR is for ${dpr.capacity}.` });
    }
    const hv = highestKv(l.description);
    if (kv && hv && hv !== kv) {
      out.push({ id: `pt-kv:${l.id}`, severity: 'blocker', step: 'estimate', message: `Item ${l.code || '?'} is a ${hv} kV transformer, but the DPR is for ${dpr.voltage}.` });
    }
  }
  const ptQty = pts.filter((l) => !unit || mvaRatings(l.description).includes(unit)).reduce((s, l) => s + l.qty, 0);
  if (unit && pts.length && ptQty > 0 && ptQty !== unitCount(dpr.capacity)) {
    out.push({ id: 'pt-qty', severity: 'warning', step: 'estimate', message: `The estimate has ${fmt(ptQty)} transformers of ${unit} MVA; the DPR capacity ${dpr.capacity} means ${unitCount(dpr.capacity)}.` });
  }

  // 2. Facts written for section 01.
  const written: [string, string | undefined][] = [
    ['Name of work', content.details.nameOfWork],
    ['MVA added', content.details.mvaAdded],
  ];
  for (const [label, text] of written) {
    const r = text ? mvaRatings(text) : [];
    if (unit && r.length && !r.includes(unit) && !(total && r.includes(total))) {
      out.push({ id: `text-mva:${label}`, severity: 'blocker', step: 'text', message: `“${label}” mentions ${r.join(', ')} MVA, but the DPR is for ${dpr.capacity}.` });
    }
  }

  // 3. BCR inputs.
  const added = e.financials?.method !== 'manual' ? e.financials?.inputs?.addedMva ?? 0 : 0;
  if (total && added > total + 0.01) {
    out.push({ id: 'bcr-mva', severity: 'blocker', step: 'finance', message: `The BCR assumes ${fmt(added)} MVA added, more than the DPR's ${dpr.capacity}.` });
  }
  const load = loadFigures(e.load, dpr.capacity);
  if (load && added > 0 && Math.abs(load.addedMva - added) > 0.01) {
    out.push({ id: 'bcr-load', severity: 'warning', step: 'finance', message: `The load data gives ${fmt(load.addedMva)} MVA added; the BCR uses ${fmt(added)} MVA.` });
  }
  if (load && load.after > 1) {
    out.push({ id: 'load-after', severity: 'warning', step: 'finance', message: `Even after the work the loading factor is ${load.after.toFixed(2)}: the added capacity does not cover the recorded peak.` });
  }

  // 4. Totals stated on the workbook's abstract sheets (the largest per part, as on import).
  const parts: StatedAbstract['part'][] = hasLineWorks(e) ? ['I', 'line'] : ['I'];
  if (e.lines.some((l) => l.section === 'dismantling')) parts.push('II');
  for (const part of parts) {
    const stated = abstracts.filter((a) => a.part === part && a.total).sort((a, b) => b.total! - a.total!)[0];
    if (!stated) continue;
    const statedLakh = stated.total! / 1e5;
    const ours = abstractOf(e, part).find((r) => r.key === 'total')!.lakhs;
    if (Math.abs(statedLakh - ours) > Math.max(0.05, statedLakh * 0.005)) {
      const name = part === 'line' ? 'Line works' : `Abstract-${part}`;
      out.push({ id: `abstract:${part}`, severity: 'warning', step: 'estimate', message: `${name} comes to ${fmt(ours)} lakh, but “${stated.sheet.trim()}” in the workbook states ${fmt(statedLakh)} lakh.` });
    }
  }
  return out;
}

/** Blockers not yet acknowledged, or acknowledged for a different message. */
export function openBlockers(checks: CrossCheck[], acks: Record<string, Acknowledgement> = {}): CrossCheck[] {
  return checks.filter((c) => c.severity === 'blocker' && acks[c.id]?.message !== c.message);
}
