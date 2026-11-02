import { allDocsOf } from '@/features/documents/state';
import type { DprDocuments } from '@/features/documents/types';
import { generalAbstract, lineAmounts } from '@/features/preparation/calc';
import { DEFAULT_FINANCIALS, summariseFinancials } from '@/features/preparation/finance';
import type { Estimate, EstimateLine } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { DETAIL_FIELDS, SECTIONS, contentOf } from './content';

/** A DPR as it was generated: everything needed to see what changed and to generate the same file again. */
export interface DprVersion {
  version: number;
  at: string;
  totalLakhs: number;
  bcr: number | null;
  irr: number | null;
  payback: number | null;
  gaps: string[];
  dpr: DprRow;
  estimate: Estimate;
  documents: DprDocuments;
}

/** Older versions are dropped beyond this, and sooner if the browser runs out of room. */
export const MAX_VERSIONS = 10;
const keyOf = (dprId: string) => `dpr-manager.dpr-versions.v1:${dprId}`;

export function listVersions(dprId: string): DprVersion[] {
  try {
    const raw = window.localStorage.getItem(keyOf(dprId));
    return raw ? (JSON.parse(raw) as DprVersion[]) : [];
  } catch {
    return [];
  }
}

export function snapshot(dpr: DprRow, estimate: Estimate, documents: DprDocuments, gaps: string[], prev: DprVersion[], now = new Date()): DprVersion {
  const totalLakhs = generalAbstract(estimate).total;
  const s = summariseFinancials(totalLakhs, estimate.financials ?? DEFAULT_FINANCIALS);
  return {
    version: (prev.at(-1)?.version ?? 0) + 1,
    at: now.toISOString(),
    totalLakhs,
    bcr: s.bcr,
    irr: s.irr,
    payback: s.payback,
    gaps,
    dpr,
    estimate: structuredClone(estimate),
    documents,
  };
}

/** Saves a version. Returns the list as kept (oldest dropped when over the limit or out of room). */
export function saveVersion(v: DprVersion): DprVersion[] {
  let list = [...listVersions(v.dpr.id), v].slice(-MAX_VERSIONS);
  while (list.length) {
    try {
      window.localStorage.setItem(keyOf(v.dpr.id), JSON.stringify(list));
      return list;
    } catch {
      if (list.length === 1) return list;
      list = list.slice(1);
    }
  }
  return list;
}

const n2 = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
const lineName = (l: EstimateLine) => `${l.code || '—'} ${l.description.slice(0, 50)}${l.description.length > 50 ? '…' : ''}`;
const lineTotal = (l: EstimateLine) => {
  const a = lineAmounts(l);
  return a.supply + a.erection + a.testing;
};

/** What changed from one generated version to the next, in plain sentences. */
export function diffVersions(prev: DprVersion, next: DprVersion): string[] {
  const out: string[] = [];
  if (Math.abs(prev.totalLakhs - next.totalLakhs) >= 0.005) out.push(`Total cost ${n2(prev.totalLakhs)} → ${n2(next.totalLakhs)} lakh (${next.totalLakhs > prev.totalLakhs ? '+' : ''}${n2(next.totalLakhs - prev.totalLakhs)})`);
  const fin = (label: string, a: number | null, b: number | null, unit = '') => {
    if (a !== b && !(a !== null && b !== null && Math.abs(a - b) < 0.005)) out.push(`${label} ${a === null ? '—' : n2(a) + unit} → ${b === null ? '—' : n2(b) + unit}`);
  };
  fin('BCR', prev.bcr, next.bcr);
  fin('IRR', prev.irr === null ? null : prev.irr * 100, next.irr === null ? null : next.irr * 100, '%');
  fin('Payback', prev.payback, next.payback, ' years');

  const before = new Map(prev.estimate.lines.map((l) => [l.id, l]));
  const after = new Map(next.estimate.lines.map((l) => [l.id, l]));
  const added = next.estimate.lines.filter((l) => !before.has(l.id));
  const removed = prev.estimate.lines.filter((l) => !after.has(l.id));
  const changed = next.estimate.lines.filter((l) => {
    const p = before.get(l.id);
    return p && (p.qty !== l.qty || p.supplyRate !== l.supplyRate || p.erectionRate !== l.erectionRate || p.testingRate !== l.testingRate || p.description !== l.description);
  });
  const list = (ls: EstimateLine[]) => ls.slice(0, 5).map(lineName).join('; ') + (ls.length > 5 ? `; and ${ls.length - 5} more` : '');
  if (added.length) out.push(`${added.length} BOQ ${added.length === 1 ? 'item' : 'items'} added: ${list(added)}`);
  if (removed.length) out.push(`${removed.length} BOQ ${removed.length === 1 ? 'item' : 'items'} removed: ${list(removed)}`);
  if (changed.length) {
    const ch = changed.map((l) => `${lineName(l)} (Rs ${n2(lineTotal(before.get(l.id)!))} → ${n2(lineTotal(l))})`);
    out.push(`${changed.length} BOQ ${changed.length === 1 ? 'item' : 'items'} changed: ${ch.slice(0, 5).join('; ')}${ch.length > 5 ? `; and ${ch.length - 5} more` : ''}`);
  }

  const a = contentOf(prev.dpr, prev.estimate);
  const b = contentOf(next.dpr, next.estimate);
  const text: string[] = [
    ...DETAIL_FIELDS.filter((f) => (a.details[f.key] ?? '') !== (b.details[f.key] ?? '')).map((f) => f.label),
    ...SECTIONS.filter((s) => (a.sections[s.key] ?? '') !== (b.sections[s.key] ?? '')).map((s) => s.title),
  ];
  if (JSON.stringify(a.salient) !== JSON.stringify(b.salient)) text.push('Salient features');
  if (JSON.stringify(a.pert) !== JSON.stringify(b.pert)) text.push('PERT chart');
  if (text.length) out.push(`Text changed: ${text.join(', ')}`);

  const files = (d: DprDocuments) => new Set(Object.entries(d.files).flatMap(([k, fs]) => fs.map((f) => `${allDocsOf(d).find((x) => x.key === k)?.name ?? k}: ${f.name}`)));
  const fa = files(prev.documents);
  const fb = files(next.documents);
  const newFiles = [...fb].filter((f) => !fa.has(f));
  const goneFiles = [...fa].filter((f) => !fb.has(f));
  if (newFiles.length) out.push(`Documents added: ${newFiles.join(', ')}`);
  if (goneFiles.length) out.push(`Documents removed: ${goneFiles.join(', ')}`);

  if (prev.gaps.length !== next.gaps.length) out.push(`Missing items ${prev.gaps.length} → ${next.gaps.length}`);
  return out;
}
