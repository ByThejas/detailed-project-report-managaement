import type { EstimateLine, EstimateSection } from '@/features/preparation/types';
import type { CatalogChildRate, CatalogItem, RateCatalog } from './types';

/**
 * Suggests catalog items for a BOQ line by the words and numbers they share, weighted so that rare words
 * ("drake", "20", "nct") count more than common ones ("kv", "supply"). A suggestion is never applied
 * without review: matching by description cannot be exact.
 */

const STOP = new Set('a an and the of for to in on with without by as per at or from is be are this that all its type suitable including incl etc complete nos no set sets mtrs mtr m each item items supplying supply providing erection'.split(' '));

const RATING_UNITS = new Set(['kv', 'mva', 'kva', 'ka', 'mm', 'sqmm', 'ah', 'kn', 'mt']);

/**
 * Words and numbers of a description. A number with its rating unit also gives a joined token ("20mva",
 * "11kv"), so ratings, the thing that tells one item from the next, weigh more than either part alone.
 */
export function tokens(text: string): string[] {
  const parts = (
    text
      .toLowerCase()
      .replace(/sq\.?\s*mm/g, 'sqmm')
      .replace(/(\d)\s*(kv|mva|kva|ka|mm|sqmm|mt|v|a|ah|w|kn)\b/g, '$1 $2')
      .match(/\d+(?:\.\d+)?|[a-z]+/g) ?? []
  ).filter((t) => !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
  const out: string[] = [];
  parts.forEach((t, i) => {
    out.push(t);
    const next = parts[i + 1];
    if (/^\d/.test(t) && next && RATING_UNITS.has(next)) out.push(`${t}${next}`);
  });
  return out;
}

type UnitKind = 'count' | 'length' | 'km' | 'weight' | 'weightDistance' | 'volume' | 'area' | 'lump' | 'other';

export function unitKind(unit: string): UnitKind {
  const u = unit.toLowerCase().replace(/[^a-z0-9/³²]/g, '');
  if (!u) return 'other';
  if (/^(t\/m|pert\/m|mt\/m)/.test(u)) return 'weightDistance';
  if (/^(no|nos|nos|each|set|sets|stack|stacks|bay|perbay|pair|unit|units|lot)/.test(u) || /^no\(/.test(unit.toLowerCase())) return 'count';
  if (/^(km|routekm|perkm|ckm)/.test(u)) return 'km';
  if (/^(m|mtr|mtrs|rmtr|rm|metre|meter|metres|meters|rmt)$/.test(u)) return 'length';
  if (/^(t|mt|tonne|tonnes|ton|kg)$/.test(u)) return 'weight';
  if (/(m3|m³|cum|cumtr|cubic)/.test(u)) return 'volume';
  if (/(m2|m²|sqm|sqmtr)/.test(u)) return 'area';
  if (/^(ls|lumpsum|job)$/.test(u)) return 'lump';
  return 'other';
}

/** Catalog sheets to search for each BOQ part. */
const SHEETS: Record<EstimateSection, (sheet: string) => boolean> = {
  electrical: (s) => s === 'By code' || s.startsWith('SR-CSR'),
  line: (s) => s === 'By code' || s.startsWith('SR-CSR'),
  civil: (s) => s.includes('Civil') || s.startsWith('utilization'),
  lineCivil: (s) => s.includes('Civil') || s === 'By code',
  dismantling: () => false,
};

export interface RateIndex {
  items: CatalogItem[];
  toks: Set<string>[];
  idf: Map<string, number>;
  /** Weighted size of each item's word set, for the cosine score. */
  norms: number[];
  /** Highest voltage class named in each item, or null. */
  hv: (number | null)[];
}

/** The highest voltage class (kV) named in a text, e.g. "110/11 kV" → 110. Null when none is named. */
export function highestKv(text: string): number | null {
  const found = [...text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*\/?\s*(?:\d+(?:\.\d+)?\s*\/?\s*)*kv\b/g)].map((m) => Number(m[1]));
  return found.length ? Math.max(...found) : null;
}

export function buildIndex(catalog: RateCatalog): RateIndex {
  const items = catalog.items.filter((i) => i.rate !== null && i.rate > 0);
  const toks = items.map((i) => new Set(tokens(`${i.item} ${i.context}`)));
  const df = new Map<string, number>();
  for (const s of toks) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + items.length / n));
  const norms = toks.map((s) => Math.sqrt([...s].reduce((sum, t) => sum + idf.get(t)! ** 2, 0)));
  const hv = items.map((i) => highestKv(`${i.item} ${i.context}`));
  return { items, toks, idf, norms, hv };
}

export interface RateSuggestion {
  item: CatalogItem;
  /** 0–1: how alike the line and the item are (cosine of their weighted words). */
  score: number;
  /** Words the line and the item share. */
  shared: number;
  supplyRate: number;
  /** Sum of the item's labour rates in the line's unit. */
  erectionRate: number;
  /** Sum of the item's T&C rates in the line's unit. */
  testingRate: number;
  /** Child rates in another unit (per tonne, per tonne-metre…) that need a quantity basis and were not added. */
  notApplied: CatalogChildRate[];
  unitMatches: boolean;
}

/** Child rates that apply per unit of the line, and those that need another basis. */
function splitChildren(children: CatalogChildRate[], lineUnit: UnitKind) {
  let total = 0;
  const notApplied: CatalogChildRate[] = [];
  for (const c of children) {
    const k = unitKind(c.unit);
    if (k === lineUnit || (k === 'other' && lineUnit === 'count')) total += c.rate;
    else notApplied.push(c);
  }
  return { total, notApplied };
}

export function suggestRates(index: RateIndex, line: Pick<EstimateLine, 'description' | 'unit' | 'section'>, max = 3): RateSuggestion[] {
  const lt = [...new Set(tokens(line.description))];
  if (!lt.length) return [];
  const weight = (t: string) => index.idf.get(t) ?? Math.log(1 + index.items.length);
  const lineHv = highestKv(line.description);
  const lineNorm = Math.sqrt(lt.reduce((s, t) => s + weight(t) ** 2, 0));
  const lu = unitKind(line.unit);
  const allowed = SHEETS[line.section];
  const scored: { i: number; score: number; shared: number }[] = [];
  index.items.forEach((item, i) => {
    if (!allowed(item.sheet)) return;
    const s = index.toks[i]!;
    let dot = 0;
    let shared = 0;
    for (const t of lt)
      if (s.has(t)) {
        dot += weight(t) ** 2;
        shared += 1;
      }
    if (!dot) return;
    // Cosine, softened toward the line's own coverage so long catalog texts are not punished too hard.
    const coverage = dot / lineNorm ** 2;
    const cosine = dot / (lineNorm * index.norms[i]!);
    let score = Math.sqrt(coverage * cosine);
    const iu = unitKind(item.unit);
    if (lu !== 'other' && iu !== 'other' && lu !== iu) score *= 0.7;
    // A different voltage class is a different item (a 66 kV transformer is not a 110 kV one).
    const hv = lineHv;
    const ihv = index.hv[i];
    if (hv !== null && ihv !== null && hv !== ihv) score *= 0.6;
    scored.push({ i, score, shared });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map(({ i, score, shared }) => suggestionFor(index.items[i]!, line, Math.min(1, score), shared));
}

/** Rates a catalog item gives a BOQ line: supply, plus the labour and T&C rates that are in the line's unit. */
export function suggestionFor(item: CatalogItem, line: Pick<EstimateLine, 'unit' | 'section'>, score = 1, shared = 0): RateSuggestion {
  const lu = unitKind(line.unit);
  const multi = line.section === 'electrical' || line.section === 'line';
  const labour = splitChildren(item.labour, lu);
  const tc = splitChildren(item.tc, lu);
  const iu = unitKind(item.unit);
  return {
    item,
    score,
    shared,
    supplyRate: item.rate ?? 0,
    erectionRate: multi ? labour.total : 0,
    testingRate: multi ? tc.total : 0,
    notApplied: multi ? [...labour.notApplied, ...tc.notApplied] : [],
    unitMatches: lu === 'other' || iu === 'other' || lu === iu,
  };
}


/** Where a rate came from, shown under the BOQ line. */
export const rateRefOf = (s: RateSuggestion) => `SoR 2023-24 · ${s.item.sheet} ${s.item.code}${s.item.sr ? ` · ${s.item.sr}` : ''}`;
