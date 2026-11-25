import type { EstimateLine, EstimateSection } from '@/features/preparation/types';
import type { CatalogChildRate, CatalogItem, RateCatalog } from './types';
import { effectiveRate } from '@/features/preparation/calc';

/**
 * Suggests catalog items for a BOQ line by the words and numbers they share, weighted so that rare words
 * ("drake", "20", "nct") count more than common ones ("kv", "supply"). A suggestion is never applied
 * without review: matching by description cannot be exact.
 */

const STOP = new Set('a an and the of for to in on with without by as per at or from is be are this that all its type suitable including incl etc complete nos no set sets mtrs mtr m each item items supplying supply providing erection'.split(' '));

const RATING_UNITS = new Set(['kv', 'mva', 'kva', 'ka', 'mm', 'sqmm', 'ah', 'kn', 'mt', 'a', 'core']);
/** Ratings that tell one size of an item from the next: a 12.5 MVA transformer is not a 20 MVA one. */
const SIZE_UNITS = ['mva', 'sqmm', 'a', 'kn', 'ah', 'core'];

/**
 * Words and numbers of a description. A number with its rating unit also gives a joined token ("20mva",
 * "11kv"), so ratings, the thing that tells one item from the next, weigh more than either part alone.
 */
/** Spellings and names that mean the same item, folded to the catalog's wording. */
const SYNONYMS: [RegExp, string][] = [
  [/\bporcel[ae]?in\b/g, 'porcelain'],
  [/\bporcelain\s+clad\s+(?:vcb|vacuum circuit breaker)/g, 'pcvcb'],
  [/\bmetal\s+clad\s+(?:vcb|vacuum circuit breaker)/g, 'mcvcb'],
  [/\b(?:potential|voltage)\s+transformers?\b/g, 'vt'],
  [/\bp\.t\.?(?=\s)|\bpts?\b/g, 'vt'],
  [/\bcurrent\s+transformers?\b/g, 'ct'],
  [/\bcts\b/g, 'ct'],
  [/\bc\.?b\.?s?\b/g, 'circuit breaker'],
  [/\bm\.\s*s\.\s*c\.?/g, 'msc'],
  [/\b(?:earth|eath|ground)\s*(?:wire|conductor)s?\b/g, 'groundwire'],
  [/\bgalvani[sz](?:ed|ing|ation)\b/g, 'galvanised'],
  [/\b(?:single|1)\s*-?\s*ph(?:ase)?\b/g, 'singlephase'],
  [/\b(?:three|3)\s*-?\s*ph(?:ase)?\b/g, 'threephase'],
  [/\bout\s+door\b/g, 'outdoor'],
  [/\bin\s+door\b/g, 'indoor'],
  [/\bearth\s*switch(?:es)?\b/g, 'earthswitch'],
  [/\balumin(?:i)?um\b/g, 'aluminium'],
  [/\bm\.\s*s\.?\s/g, 'ms '],
  [/\bmild\s+steel\b/g, 'ms'],
  // Surge arrester duty: "class - II", "class 2" and "Discharge Class 2" are one rating.
  [/\bclass\s*[-:]?\s*(?:iii|3)\b/g, 'class3'],
  [/\bclass\s*[-:]?\s*(?:ii|2)\b/g, 'class2'],
  [/\bhigh\s+tensile(?:\s+steel)?\b/g, 'ht'],
  // Mid span compression joints: "M.S.C. Joints", "MSC joint", "Splice (MSC)".
  [/\bmid[\s-]*span\s+compression\s+joints?\b|\bsplice\s*\(?\s*msc\s*\)?|\bmsc\s+joints?\b/g, 'msc joint'],
  // Isolator breaks: "D/B", "double break", "S/B", "single break".
  [/\bd\s*\/\s*b\b|\bdouble\s*-?\s*break\b/g, 'doublebreak'],
  [/\bs\s*\/\s*b\b|\bsingle\s*-?\s*break\b/g, 'singlebreak'],
  // An 11 kV GOS is an isolator.
  [/\bg\.?o\.?s\b/g, 'gos isolator'],
  // HTLS conductor is what the SoR calls High Performance Conductor (HPC).
  [/\bhtls\b/g, 'hpc'],
  [/\bhigh\s+performance\s+conductor\b/g, 'hpc'],
];

/** Plural and singular are the same word: "cables" = "cable", "isolators" = "isolator". */
const singular = (t: string) => (t.length > 3 && /[a-z]s$/.test(t) && !/(ss|us|is)$/.test(t) ? t.slice(0, -1) : t);

/** CT ratios ("800-400/1-1-1 A", "200-100/ l-l-lA") as one token each, so 800-400 is never taken for 200-100. */
const ratios = (lower: string) => [...lower.matchAll(/(\d+(?:\s*-\s*\d+)+)\s*\/\s*[1l](?:\s*-\s*[1l])*/g)].map((m) => `ratio${m[1]!.replace(/\s/g, '').replace(/-/g, 'x')}`);

export function tokens(text: string): string[] {
  let lower = text.toLowerCase();
  const ctRatios = ratios(lower);
  for (const [re, to] of SYNONYMS) lower = lower.replace(re, to);
  // "without earth switch" is not "with earth switch": keep the negated word as its own token.
  lower = lower.replace(/\bwithout\s+([a-z]+)/g, 'without$1 $1');
  const parts = (
    lower
      .replace(/sq\.?\s*mm/g, 'sqmm')
      // "4C x 6", "4 Core", "4-core" and "4c" all name the core count.
      .replace(/(\d)\s*-?\s*(?:cores?|c)\b/g, '$1 core')
      // "220/110/66 kV" names each of 220 kV, 110 kV and 66 kV.
      .replace(/(\d+(?:\.\d+)?)((?:\s*[/-]\s*\d+(?:\.\d+)?)+)\s*kv\b/g, (_, a: string, rest: string) => [a, ...rest.match(/\d+(?:\.\d+)?/g)!].map((v) => `${v} kv`).join(' '))
      .replace(/(\d)\s*(kv|mva|kva|ka|mm|sqmm|mt|v|a|ah|w|kn)\b/g, '$1 $2')
      .match(/\d+(?:\.\d+)?|[a-z]+/g) ?? []
  )
    // "6.0" and "6" are the same number.
    .map((t) => (/^\d+\.\d+$/.test(t) ? String(Number(t)) : singular(t)))
    .filter((t) => t === 'a' || (!STOP.has(t) && (t.length > 1 || /\d/.test(t))));
  const out: string[] = [];
  parts.forEach((t, i) => {
    // "a" counts only as amperes after a number ("1250 A"), never on its own.
    if (t !== 'a') out.push(t);
    const next = parts[i + 1];
    if (/^\d/.test(t) && next && RATING_UNITS.has(next)) out.push(`${t}${next}`);
  });
  return [...out, ...ctRatios];
}

type UnitKind = 'count' | 'length' | 'km' | 'weight' | 'weightDistance' | 'volume' | 'area' | 'lump' | 'other';

export function unitKind(unit: string): UnitKind {
  const u = unit.toLowerCase().replace(/[^a-z0-9/³²]/g, '');
  if (!u) return 'other';
  if (/^(t\/m|pert\/m|mt\/m)/.test(u)) return 'weightDistance';
  // "MT (2 No)": tonnes, with the count of towers alongside.
  if (/^\s*(?:mt|t|tonnes?)\s*\(/i.test(unit)) return 'weight';
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
  electrical: (s) => s === 'By code' || s.startsWith('SR-CSR') || s === 'utilization works',
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
  /** Voltage classes each item is for (empty when it names none). */
  hv: Set<number>[];
  /**
   * The civil schedule of rates the user added, indexed on its own so its words never change how the
   * electrical SoR matches. Civil BOQ parts are matched against both.
   */
  civil?: RateIndex;
}

const isCivilSection = (section: EstimateSection) => section === 'civil' || section === 'lineCivil';

/** Every item of the index: the electrical SoR and the civil catalog. */
export const allItems = (index: RateIndex): CatalogItem[] => (index.civil ? [...index.items, ...index.civil.items] : index.items);

/** Rated equipment voltages name their system voltage: a 72.5 kV breaker is for a 66 kV system. */
const EQUIPMENT_KV: Record<number, number> = { 12: 11, 36: 33, 72.5: 66, 123: 110, 145: 132, 245: 220, 420: 400 };

/** The highest voltage class (kV) named in a text, e.g. "110/11 kV" → 110. Null when none is named. */
export function highestKv(text: string): number | null {
  // "110/33-11 kV" is a 110 kV item: the first of a run of voltages joined by "/" or "-" is the highest.
  const found = [...text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(?:[/-]\s*\d+(?:\.\d+)?\s*)*kv\b/g)].map((m) => EQUIPMENT_KV[Number(m[1])] ?? Number(m[1]));
  return found.length ? Math.max(...found) : null;
}

/**
 * Voltage classes an item is for. "110/33-11 kV" is a 110 kV item (the first of a short run is the highest), but a run of
 * three or more ("220/110/66/33 kV" clamps) lists the classes the item suits, and an item naming "110 kV, 66 kV & 33 kV"
 * suits each of them.
 */
export function kvClasses(text: string): Set<number> {
  const out = new Set<number>();
  let top: number | null = null;
  for (const m of text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*((?:[/-]\s*\d+(?:\.\d+)?\s*)*)kv\b/g)) {
    const run = [m[1]!, ...(m[2]!.match(/\d+(?:\.\d+)?/g) ?? [])].map((v) => EQUIPMENT_KV[Number(v)] ?? Number(v));
    if (run.length >= 3) for (const v of run) out.add(v);
    top = Math.max(top ?? 0, ...run);
  }
  if (top !== null) out.add(top);
  return out;
}

/**
 * Steel structures (towers, station beams and columns, equipment mounting structures, cross arms) are priced from the SoR's
 * tower steel by weight. Their BOQ wording ("6T1 station towers", "66 kV isolator mounting structure (0.532 MT)") shares
 * almost no words with "Fabrication, galvanising and supply of Mild Steel tower materials", so both get a shared token.
 */
const STEEL = 'steelwork';
const isSteelItem = (i: Pick<CatalogItem, 'item' | 'unit'>) =>
  unitBasis(i.unit) === 'weight' && /tower materials|bolts\s*&\s*nuts|steel pole structure/i.test(i.item);
/** "including bolts & nuts", "with bolts and nuts (0.011 MT)", "(Weight of Nuts & Bolts=0.010)", "+ 5% B&N". */
const INCLUDED_BOLTS = /\b(?:including|incl\.?|with|along\s+with)\s+(?:the\s+)?(?:galvani[sz]ed\s+)?bolts?\s*(?:&|and|,)\s*nuts?(?:\s*(?:&|and|,)\s*washers?)?|\(?\s*weight\s+of\s+(?:nuts?|bolts?)[^)]*\)?|(?:\(\s*)?[\d.]+\s*mt\s+per\s+structure\s+for\s+bolts?\s*(?:&|and)\s*nuts?\s*\)?|\+\s*\d+\s*%\s*b\s*&\s*n/gi;
const BOLT_WORDS = ['bolt', 'nut', 'washer'];
const STRUCTURE_WORDS = /\b(structures?|towers?|beams?|columns?|verticals?|lattice|cross\s*-?\s*arms?|extensions?|girders?|stools?|pedestals?)\b/i;
/** A line for steel bought by weight: in tonnes, or in Nos that carry a weight, and naming a structure. */
export const isSteelStructureLine = (line: Pick<EstimateLine, 'description' | 'unit'> & { qty?: number; group?: string; basis?: LabourBasis }) =>
  (unitBasis(line.unit) === 'weight' || /^mt\s*\(/i.test(line.unit.trim()) || (unitBasis(line.unit) === 'no' && !!weightPerNo(line))) &&
  STRUCTURE_WORDS.test(`${line.description} ${line.group ?? ''}`);

/** Every voltage class a text names, in order. */
const kvMentions = (text: string) => [...text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*kv\b/g)].map((m) => EQUIPMENT_KV[Number(m[1])] ?? Number(m[1]));

/**
 * Voltage classes of a catalog item from its most specific words: "CONTROL & RELAY PANEL : 110 kV, 66 kV & 33 kV
 * Sub-station : Simplex … 66 kV Panel for Overhead Line" is a 66 kV panel, not one for every class its chapter names.
 */
export function itemKv(item: Pick<CatalogItem, 'item' | 'context'>): Set<number> {
  const parts = item.item.split(/\s:\s/);
  if (parts.length > 1 && new Set(kvMentions(parts.slice(0, -1).join(' '))).size >= 3) {
    const last = kvClasses(parts[parts.length - 1]!);
    if (last.size) return last;
  }
  return kvClasses(`${item.item} ${item.context}`);
}

/** The match index of the electrical SoR, with the civil catalog (when there is one) as its own index beside it. */
export function buildIndex(catalog: RateCatalog, civil?: RateCatalog | null): RateIndex {
  const own = indexOf(catalog.items.filter((i) => i.book !== 'civil'));
  const civilItems = [...catalog.items.filter((i) => i.book === 'civil'), ...(civil?.items ?? []).map((i) => (i.book === 'civil' ? i : { ...i, book: 'civil' as const }))];
  const sub = indexOf(civilItems);
  return sub.items.length ? { ...own, civil: sub } : own;
}

function indexOf(all: CatalogItem[]): RateIndex {
  const items = all.filter((i) => i.rate !== null && i.rate > 0);
  const toks = items.map((i) => {
    const t = new Set(tokens(`${i.item} ${i.context}`));
    if (isSteelItem(i)) t.add(STEEL);
    return t;
  });
  const df = new Map<string, number>();
  for (const s of toks) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + items.length / n));
  const norms = toks.map((s) => Math.sqrt([...s].reduce((sum, t) => sum + idf.get(t)! ** 2, 0)));
  const hv = items.map(itemKv);
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
  /** Per-tonne rates turned into per-No rates from the line's tonnage, in words. */
  converted: string[];
  unitMatches: boolean;
  /** The line names this item by its SoR code. */
  exact?: boolean;
  /** The user chose this item before for the same wording. */
  remembered?: boolean;
}

/**
 * The basis a unit prices by, finer than its kind: "No", "Set" and "Set (3 Nos.)" are all counts, but a
 * rate per set of three applied per No would be three times too high, so they must not be mixed up.
 * Panels, stacks, bays and pairs count as one No each.
 */
export function unitBasis(unit: string): string {
  const u = unit.toLowerCase().replace(/^\s*per\s+/, '').trim();
  const kind = unitKind(u);
  // A rate per kg is a thousandth of a rate per tonne: both are weights, but not the same basis.
  if (kind === 'weight') return /^(kg|kgs)\b/.test(u.replace(/[^a-z]/g, '')) ? 'kg' : 'weight';
  if (kind !== 'count') return kind;
  const setOf = /^sets?\s*\(\s*(\d+)/.exec(u);
  if (setOf) return `set of ${setOf[1]}`;
  if (/^sets?\b/.test(u)) return 'set';
  return 'no';
}

/**
 * What a rate in the item's unit is multiplied by to price the line's unit: 1 for the same basis, 1000 for a line in
 * km priced from a rate per metre, or in tonnes from a rate per kg (and the inverse). Null when they don't convert.
 */
export function unitFactor(lineUnit: string, itemUnit: string): number | null {
  const lb = unitBasis(lineUnit);
  const ib = unitBasis(itemUnit);
  if (lb === ib) return 1;
  // "MT (5 No)" is a line in tonnes.
  const lw = /^mt\s*\(/i.test(lineUnit.trim()) ? 'weight' : lb;
  if (lw === ib) return 1;
  const pairs: Record<string, number> = { 'km|length': 1000, 'length|km': 0.001, 'weight|kg': 1000, 'kg|weight': 0.001 };
  return pairs[`${lw}|${ib}`] ?? null;
}

/** Total tonnage a "No/MT" line carries in its unit, e.g. "No (6.907 MT)" → 6.907. */
export const tonnesOf = (unit: string): number | null => {
  const m = /\((\d+(?:\.\d+)?)\s*MT\)/i.exec(unit);
  return m ? Number(m[1]) : null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * How to turn SoR labour and T&C given per Set, per tonne or per tonne-metre into a rate per No of the
 * line. The estimator chooses these: KPTCL estimates count a Set as 1 No for some items and 3 Nos for others.
 */
export interface LabourBasis {
  /** Nos in one Set of the SoR's labour rate (1 or 3). */
  setNos?: number;
  /** Weight of one No of the line, tonnes. */
  tonnes?: number;
  /** Moving distance for per tonne-metre rates (transformer haulage), metres. */
  metres?: number;
}

/** "Set" or "Set (3 Nos.)": a count of sets, which a line in Nos can only use once the estimator says what a Set is. */
export const isSetBasis = (basis: string) => basis === 'set' || /^set of \d+$/.test(basis);
/** The Nos in one Set that a unit states, e.g. 3 for "Set (3 Nos.)". */
export const nosInSet = (unit: string) => {
  const b = unitBasis(unit);
  return /^set of \d+$/.test(b) ? Number(b.slice(7)) : undefined;
};

type LineBasis = Pick<EstimateLine, 'unit' | 'section'> & { qty?: number; basis?: LabourBasis };

/** Weight of one No from the BOQ: "(0.532 t per structure)" in the text, or "No (0.474 MT)" over the quantity. */
export function tonnesPerNo(line: Pick<EstimateLine, 'description' | 'unit' | 'qty'>): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(?:t|mt|tonnes?)\s*(?:per|\/)\s*(?:structure|no|unit|set)/i.exec(line.description);
  if (m) return Number(m[1]);
  const total = tonnesOf(line.unit);
  return total && line.qty > 0 ? total / line.qty : undefined;
}

/**
 * Nos in one Set of an item's SoR labour and T&C, when the estimator has not said. The SoR marks CT and PT erection
 * "[set/3]", and the 21 KPTCL estimates divide the Set rates of CTs, PTs/VTs and lightning arresters by 3 (single-phase
 * units, three to a set) and take a Set of breakers, isolators, NCTs and panels as one No. 0 means "not added".
 */
export function usualSetNos(item: Pick<CatalogItem, 'item' | 'context' | 'labour' | 'tc'>): number {
  if ([...item.labour, ...item.tc].some((c) => /set\s*\/\s*3\b/i.test(c.text))) return 3;
  const text = `${item.context} ${item.item}`;
  if (/\bneutral\b|\bnct\b/i.test(text)) return 1;
  return /current\s+transformer|voltage\s+transformer|potential\s+transformer|\bcvt\b|surge\s+arr?est|lightn?ing\s+arr?est/i.test(text) ? 3 : 1;
}

/**
 * Short child rates that are alternatives, not parts ("Fixing Number Plate" and "Fixing Circuit plate" under one item):
 * when the line names exactly one of them, only that one applies.
 */
function alternativeFor(children: CatalogChildRate[], line: LineBasis & { description?: string }): CatalogChildRate[] {
  if (children.length < 2 || !line.description || children.some((c) => c.text.length > 40)) return children;
  const sets = children.map((c) => new Set(tokens(c.text)));
  const common = new Set([...sets[0]!].filter((t) => sets.every((x) => x.has(t))));
  const own = new Set(tokens(line.description));
  const hits = children.filter((_, i) => [...sets[i]!].some((t) => !common.has(t) && own.has(t)));
  return hits.length === 1 ? hits : children;
}

/** SoR labour that estimates leave out unless asked: sorting tower parts (KPTCL line estimates charge assembly and erection only). */
const OPTIONAL_CHILD = /^\s*sorting\b/i;

/** Weight of one No of a line: the estimator's figure, else the tonnage in its unit over the quantity. */
const weightPerNo = (line: Pick<LineBasis, 'unit' | 'qty' | 'basis'> & { description?: string }): number | undefined => {
  if (line.basis?.tonnes) return line.basis.tonnes;
  if (line.description !== undefined) return tonnesPerNo({ description: line.description, unit: line.unit, qty: line.qty ?? 0 });
  const total = tonnesOf(line.unit);
  return total && line.qty && line.qty > 0 ? total / line.qty : undefined;
};

/**
 * Child rates that apply per unit of the line, and those that need another basis. A per-tonne rate is
 * turned into a rate per No when the line carries its tonnage ("No (6.907 MT)"), as KPTCL does for
 * structures and towers (erection Rs/MT × tonnes ÷ number).
 */
function splitChildren(children: CatalogChildRate[], line: LineBasis, item: CatalogItem) {
  let sum = 0;
  const notApplied: CatalogChildRate[] = [];
  const converted: string[] = [];
  const lb = unitBasis(line.unit);
  const ib = unitBasis(item.unit);
  const b = { ...line.basis, setNos: line.basis?.setNos ?? usualSetNos(item) };
  children = alternativeFor(children, line);
  const lineTonnes = tonnesOf(line.unit);
  const tonnes = b.tonnes ?? (lineTonnes && line.qty && line.qty > 0 ? lineTonnes / line.qty : undefined);
  for (const c of children) {
    const cb = unitBasis(c.unit);
    // Sorting tower parts is not usually charged in KPTCL estimates: shown as not added, for the estimator to add.
    if (OPTIONAL_CHILD.test(c.text)) {
      notApplied.push(c);
      continue;
    }
    const f = lb !== 'other' && cb !== 'other' ? unitFactor(line.unit, c.unit) : null;
    if (lb !== 'other' && cb === lb) sum += c.rate;
    else if (f !== null && f !== 1) {
      sum += c.rate * f;
      converted.push(`${formatRate(c.rate)} per ${c.unit} × ${f} = ${formatRate(r2(c.rate * f))} per ${line.unit}`);
    }
    // A child with no readable unit is taken to be in the item's own unit.
    else if (cb === 'other' && lb !== 'other' && lb === ib) sum += c.rate;
    else if (cb === 'weight' && lb === 'no' && tonnes) {
      sum += c.rate * tonnes;
      converted.push(`${formatRate(c.rate)} per ${c.unit} × ${r3(tonnes)} t = ${formatRate(r2(c.rate * tonnes))} per No`);
    } else if (cb === 'weightDistance' && lb === 'no' && tonnes && b.metres) {
      sum += c.rate * tonnes * b.metres;
      converted.push(`${formatRate(c.rate)} per ${c.unit} × ${r3(tonnes)} t × ${b.metres} m = ${formatRate(r2(c.rate * tonnes * b.metres))} per No`);
    } else if (isSetBasis(cb) && lb === 'no' && (nosInSet(c.unit) ?? b.setNos)) {
      const n = nosInSet(c.unit) ?? b.setNos!;
      // The estimator says how many Nos of the BOQ make one Set of the SoR.
      sum += c.rate / n;
      converted.push(`${formatRate(c.rate)} per ${c.unit} ÷ ${n} = ${formatRate(r2(c.rate / n))} per No`);
    } else notApplied.push(c);
  }
  return { total: sum, notApplied, converted };
}

const formatRate = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const OPPOSITES: [string, string][] = [
  ['doublebreak', 'singlebreak'],
  ['indoor', 'outdoor'],
  // Surge arrester duty: station medium (SM, class 3) against station low (SL, class 2).
  ['sm', 'sl'],
  ['class3', 'class2'],
  ['single', 'twin'],
  ['copper', 'aluminium'],
  ['ms', 'ht'],
  ['pcvcb', 'mcvcb'],
  ['ct', 'vt'],
  ['singlephase', 'threephase'],
  ['existing', 'new'],
  ['suspension', 'tension'],
];
const PART_WORDS = ['bolt', 'nut', 'washer'];
/** Conductor names: hardware and joints are priced per conductor, so the line must name the same one. */
const CONDUCTORS = ['moose', 'coyote', 'drake', 'lynx', 'panther', 'zebra', 'bersimis', 'rabbit', 'weasel', 'dog', 'wolf', 'hpc', 'htls'];

/** The part of a BOQ description that names the item: notes and working ("Note:- For stringing 2nd circuit = …") are cut off. */
export const itemText = (description: string) => description.split(/\bnote\s*[:-]|\bnotes?\s*\d\)/i)[0]!.trim() || description;

/**
 * What the whole estimate says about the work, for lines that leave it out: the one conductor it names ("Vibration
 * dampers" in an HPC re-conductoring job are HPC dampers), stringing on existing towers, and a stated ampacity.
 */
export function jobContext(lines: Pick<EstimateLine, 'description'>[]): string[] {
  const text = lines.map((l) => l.description).join(' \n ');
  const toks = new Set(tokens(text));
  const out: string[] = [];
  const conductors = CONDUCTORS.filter((c) => toks.has(c));
  if (conductors.length === 1) out.push(conductors[0]!);
  if (/\bexisting\s+(?:towers?|supports?|line)\b|\bon\s+exis?ting\s+towers?/i.test(text)) out.push('existing');
  const amps = new Set([...text.matchAll(/ampacity\D{0,6}(\d{3,4})\s*(?:a\b|amps?)/gi)].map((m) => `${m[1]}a`));
  if (amps.size === 1) out.push(...amps);
  return out;
}

export function suggestRates(index: RateIndex, line: LineBasis & Pick<EstimateLine, 'description'> & { group?: string; job?: string[] }, max = 3): RateSuggestion[] {
  const own = suggestFrom(index, line, max);
  // Civil items are matched against the civil schedule of rates too, the best of both first.
  if (!index.civil || !isCivilSection(line.section)) return own;
  return [...suggestFrom(index.civil, line, max, true), ...own].sort((a, b) => b.score - a.score).slice(0, max);
}

function suggestFrom(index: RateIndex, line: LineBasis & Pick<EstimateLine, 'description'> & { group?: string; job?: string[] }, max: number, civilBook = false): RateSuggestion[] {
  const steelLine = isSteelStructureLine(line);
  // A structure "including bolts & nuts" is steel, not bolts. Only a heading such as "Supply of galvanised bolts, nuts
  // and washers", or the "(contd.)" row of a structure, is for the bolts and nuts themselves.
  const boltsRow = steelLine && /\(contd\.?\)/i.test(line.description) && /bolts?|nuts?/i.test(line.description);
  const included = (t: string) => (steelLine && !boltsRow ? t.replace(INCLUDED_BOLTS, ' ') : t);
  const own = new Set(tokens(included(itemText(line.description))));
  if (steelLine) {
    own.add(STEEL);
    if (boltsRow) own.add('bolt').add('nut');
  }
  // Words of the headings the line sits under ("Fabrication and supply of towers" over "a) Normal tower") help, at a lower weight.
  const boltsHeading = /\bsupply\s+of\s+(?:galvani[sz]ed\s+)?bolts?\b/i.test(line.group ?? '');
  const fromGroup = new Set(tokens(included(line.group ?? '')).filter((t) => !own.has(t) && !(steelLine && !boltsHeading && BOLT_WORDS.includes(t))));
  // Steel is mild steel unless the line says high tensile, or it is the bolts and nuts.
  if (steelLine && !own.has('ht') && !own.has('bolt') && !fromGroup.has('bolt')) own.add('ms');
  const fromJob = new Set((line.job ?? []).filter((t) => !own.has(t) && !fromGroup.has(t)));
  // A line naming its own conductor needs none from the job.
  if (CONDUCTORS.some((c) => own.has(c) || fromGroup.has(c))) for (const c of CONDUCTORS) fromJob.delete(c);
  const lt = [...own, ...fromGroup, ...fromJob];
  if (!own.size) return [];
  // A fragment ("For 66 kV transformer", "Upright mounting type…") only qualifies the item its heading names, so
  // the heading counts in full.
  const named = [...own].filter((t) => /^[a-z]{3,}$/.test(t) && t !== STEEL);
  const fragment = fromGroup.size > 0 && (/^\s*(?:[a-z]{1,3}\)\s*)?for\b/i.test(line.description) || named.length <= 1);
  const groupWeight = fragment ? 1 : 0.6;
  const weight = (t: string) => (index.idf.get(t) ?? Math.log(1 + index.items.length)) * (fromGroup.has(t) ? groupWeight : fromJob.has(t) ? 0.5 : 1);
  const sizes = (set: Iterable<string>) => {
    const out = new Map<string, Set<string>>();
    for (const t of set) {
      const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(t);
      if (m && SIZE_UNITS.includes(m[2]!)) out.set(m[2]!, (out.get(m[2]!) ?? new Set()).add(m[1]!));
    }
    return out;
  };
  const lineSizes = sizes(own);
  const jobSizes = sizes(fromJob);
  const lineHv = highestKv(line.description.replace(/\([^)]*\)/g, ' ')) ?? highestKv(line.description);
  // Job words only add to a match; a line is not judged less like an item for words it never had.
  const lineNorm = Math.sqrt(lt.reduce((s, t) => s + (fromJob.has(t) ? 0 : weight(t) ** 2), 0));
  const lu = unitKind(line.unit);
  const allowed = SHEETS[line.section];
  const scored: { i: number; score: number; shared: number }[] = [];
  index.items.forEach((item, i) => {
    if (!civilBook && !allowed(item.sheet)) return;
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
    // A line priced by weight or length (towers in MT, conductor in km) is never a counted item, and the reverse.
    // A structure bought by weight is steel, not the equipment it carries ("66 kV isolator (0.532 t per structure)").
    if (steelLine && !s.has(STEEL)) score *= 0.4;
    const byWeight = lu === 'count' && iu === 'weight' && !!weightPerNo(line);
    if (lu !== 'other' && iu !== 'other' && lu !== iu && !byWeight) score *= (lu === 'count') !== (iu === 'count') ? 0.5 : 0.7;
    // A different voltage class is a different item (a 66 kV transformer is not a 110 kV one).
    const ihv = index.hv[i]!;
    if (lineHv !== null && ihv.size && !ihv.has(lineHv)) score *= 0.6;
    // A different size (12.5 MVA against 16/20 MVA, 1000 sq mm against 630) is a different item too.
    if (lineSizes.size) {
      const itemSizes = sizes(s);
      for (const [unit, values] of lineSizes) {
        const theirs = itemSizes.get(unit);
        if (theirs && ![...values].some((v) => theirs.has(v))) score *= 0.55;
      }
    }
    // A unit that converts (km against a rate per metre) is as good as the same unit.
    if (lu !== iu && unitFactor(line.unit, item.unit) !== null) score /= (lu === 'count') !== (iu === 'count') ? 0.5 : 0.7;
    // Opposites: an indoor kit is not an outdoor one, copper is not aluminium. An item naming both
    // ("Indoor/Outdoor 11 kV CT … OUTDOOR") is the one its text names last.
    for (const [a, b] of OPPOSITES) {
      let ia = s.has(a);
      let ib = s.has(b);
      if (ia && ib) {
        const order = tokens(item.item);
        ia = order.lastIndexOf(a) > order.lastIndexOf(b);
        ib = !ia;
      }
      if ((own.has(a) || fromGroup.has(a)) && ib && !ia) score *= 0.6;
      if ((own.has(b) || fromGroup.has(b)) && ia && !ib) score *= 0.6;
    }
    // A rating the job names (an ampacity of 700 A) and the line leaves out: an item of another one fits less well.
    for (const [unit, values] of jobSizes) {
      const theirs = sizes(s).get(unit);
      if (!lineSizes.has(unit) && theirs && ![...values].some((v) => theirs.has(v))) score *= 0.85;
    }
    // A different CT ratio is a different CT.
    const lineRatios = [...own].filter((t) => t.startsWith('ratio'));
    if (lineRatios.length) {
      const theirs = [...s].filter((t) => t.startsWith('ratio'));
      if (theirs.length && !lineRatios.some((t) => s.has(t))) score *= 0.55;
    }
    // Hardware for Moose conductor is not hardware for Coyote.
    const lineCond = CONDUCTORS.filter((c) => own.has(c) || fromGroup.has(c));
    if (lineCond.length && CONDUCTORS.some((c) => s.has(c)) && !lineCond.some((c) => s.has(c))) score *= 0.6;
    // An item that is only one part of a thing (bolts and nuts of a tower) is not the thing itself.
    for (const w of PART_WORDS) if (s.has(w) && !own.has(w) && !fromGroup.has(w)) score *= 0.6;
    // KPTCL works are priced from the KPTCL SR; the ESCOM 11 kV stock list is a fallback (0.75 tested best on 21 KPTCL workbooks).
    if (line.section !== 'civil' && /SR-CSR/i.test(item.sheet)) score *= 0.75;
    // Station building services (rubber mats, fire extinguishers, lighting) are in the utilization schedule.
    if (line.section === 'electrical' && item.sheet.startsWith('utilization')) score *= 0.75;
    scored.push({ i, score, shared });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map(({ i, score, shared }) => suggestionFor(index.items[i]!, line, Math.min(1, score), shared));
}

/** Rates a catalog item gives a BOQ line: supply, plus the labour and T&C rates that are in the line's unit. */
export function suggestionFor(item: CatalogItem, lineIn: LineBasis, score = 1, shared = 0): RateSuggestion {
  // A BOQ row with no unit is taken to be in the item's unit (control cables in m, equipment in Nos).
  const line = lineIn.unit.trim() ? lineIn : { ...lineIn, unit: item.unit };
  const multi = line.section === 'electrical' || line.section === 'line';
  const labour = splitChildren(item.labour, line, item);
  const tc = splitChildren(item.tc, line, item);
  const lb = unitBasis(line.unit);
  const ib = unitBasis(item.unit);
  const setNos = line.basis?.setNos ?? nosInSet(item.unit) ?? usualSetNos(item);
  // A supply rate per Set on a line in Nos, once the estimator has said how many Nos a Set is.
  let f = lb === 'no' && isSetBasis(ib) && setNos ? 1 / setNos : unitFactor(line.unit, item.unit);
  // Steel per tonne on a structure counted in Nos ("No (0.532 MT)"): the rate per tonne × the weight of one No.
  const tonnes = lb === 'no' && (ib === 'weight' || ib === 'kg') ? weightPerNo(line) : undefined;
  const supplyNote: string[] = [];
  if (tonnes && f === null) {
    f = (ib === 'kg' ? 1000 : 1) * tonnes;
    supplyNote.push(`Supply ${formatRate(item.rate ?? 0)} per ${item.unit} × ${r3(tonnes)} t = ${formatRate(r2((item.rate ?? 0) * f))} per No`);
  }
  return {
    item,
    score,
    shared,
    supplyRate: (item.rate ?? 0) * (f !== null && f !== 1 ? f : 1),
    erectionRate: multi ? labour.total : 0,
    testingRate: multi ? tc.total : 0,
    notApplied: multi ? [...labour.notApplied, ...tc.notApplied] : [],
    converted: [...supplyNote, ...(multi ? [...labour.converted, ...tc.converted] : [])],
    unitMatches: lb === 'other' || ib === 'other' || lb === ib || f !== null,
  };
}

/**
 * The line after taking a catalog suggestion. The catalog's supply rate replaces the line's; its erection
 * and T&C rates replace the line's only when the catalog has one in the line's unit. A catalog with no such
 * rate (none at all, or only per tonne-metre) never wipes out a rate the line already has: that would drop
 * the erection cost from the estimate without anyone noticing.
 */
export function applySuggestion(line: EstimateLine, s: RateSuggestion): { line: EstimateLine; kept: ('erection' | 'testing')[] } {
  const multi = line.section === 'electrical' || line.section === 'line';
  const kept: ('erection' | 'testing')[] = [];
  const pick = (catalog: number, now: number, kind: 'erection' | 'testing') => {
    if (!multi) return 0;
    if (catalog > 0) return catalog;
    if (now > 0) kept.push(kind);
    return now;
  };
  const erectionRate = pick(s.erectionRate, line.erectionRate, 'erection');
  const testingRate = pick(s.testingRate, line.testingRate, 'testing');
  // A catalog rate is per the line's own unit, so an amount kept from the file (worked on a weight or distance) stops
  // applying to every rate the catalog replaces. Rates kept as they were keep their file amount.
  const pins = { ...line.fileAmounts };
  delete pins.supply;
  if (erectionRate !== line.erectionRate) delete pins.erection;
  if (testingRate !== line.testingRate) delete pins.testing;
  const { fileAmounts: _drop, ...rest } = line;
  void _drop;
  return {
    line: {
      ...rest,
      ...(Object.keys(pins).length ? { fileAmounts: pins } : {}),
      supplyRate: s.supplyRate,
      erectionRate,
      testingRate,
      rateRef: rateRefOf(s),
      labourNotAdded: multi && s.notApplied.length ? s.notApplied.map((n) => `Rs ${formatRate(n.rate)} per ${n.unit}`).join(', ') : undefined,
    },
    kept,
  };
}

/**
 * Work items with no material in them (re-erecting released equipment, testing, excavation, surveys, re-stringing).
 * They carry a labour or T&C rate only, so a catalog match must never give them a supply rate.
 */
export const isLabourOnly = (description: string) =>
  /^\s*(testing|test\b|check survey|excavation|jelly|releas|re-?\s*erect|dismantl|integration of)|re-?\s*erection|released and|releasing and|re-?stringing|stub templates/i.test(description);

/**
 * Below this score the best match is a guess, not a match: on 21 KPTCL estimates, 140 of the 183 lines scoring under it
 * have no item at their rate anywhere in SoR 76 (mostly KPWD civil work), and only 5 of them were matched right.
 */
export const WEAK_SCORE = 0.15;
/** The line's best suggestion is too weak to show as a match: the SoR probably does not list the item. */
export const isWeakMatch = (s: RateSuggestion | undefined) => !s || (!s.exact && !s.remembered && s.score < WEAK_SCORE);

/** A match close enough to tick for the user: very close wording, every number in the BOQ line also in the item, same unit. */
export const RELIABLE_SCORE = 0.85;
const numbersOf = (t: string) => t.toLowerCase().match(/\d+(?:\.\d+)?/g) ?? [];
/**
 * A looser wording score is enough when the next suggestion is well behind and any rating the line names
 * (12.5 MVA, 4C x 95 sq mm, 1250 A) is in the item too. Tested on 21 KPTCL estimates: 121 lines trusted in all,
 * 118 at exactly the workbook's rate; the other three are the right SoR item where the workbook used another rate
 * (Telagi's 12.5 MVA transformer, and isolators of 4250 mm live point height priced as the 4600 mm ones).
 */
export const RATED_SCORE = 0.6;
export const RATED_GAP = 0.2;
const RATING_TOKEN = /^(\d+(?:\.\d+)?)(mva|sqmm|a|kn|ah|core)$/;
function ratedEnough(line: Pick<EstimateLine, 'description'>, s: RateSuggestion, next?: RateSuggestion | null): boolean {
  if (s.score < RATED_SCORE || (next && s.score - next.score < RATED_GAP)) return false;
  const ratings = tokens(line.description).filter((t) => RATING_TOKEN.test(t));
  // A clear lead is enough on its own (tested on 21 KPTCL estimates: 15 more lines trusted, all at the workbook's rate),
  // but a rating the line names must be in the item.
  if (!ratings.length) return true;
  const item = new Set(tokens(`${s.item.item} ${s.item.context}`));
  return ratings.every((t) => item.has(t));
}

/** `next` is the runner-up suggestion, when there is one: a clear lead lets a rated line be trusted on a looser score. */
export function isReliable(line: Pick<EstimateLine, 'description'> & { group?: string }, s: RateSuggestion, next?: RateSuggestion | null): boolean {
  // A fragment such as "For 66kV Line" (the item's name sits in a heading above it) says too little to trust.
  if ((s.score < RELIABLE_SCORE && (next === undefined || !ratedEnough(line, s, next))) || !s.unitMatches || isLabourOnly(line.description) || new Set(tokens(line.description)).size < 4) return false;
  // An item for one conductor (Moose) is only trusted when the line or its heading names that conductor.
  const itemToks = new Set(tokens(`${s.item.item} ${s.item.context}`));
  const lineToks = new Set(tokens(`${line.description} ${line.group ?? ''}`));
  if (CONDUCTORS.some((c) => itemToks.has(c) && !lineToks.has(c))) return false;
  const have = new Set(numbersOf(`${s.item.item} ${s.item.context}`));
  return numbersOf(line.description).every((n) => have.has(n));
}

/** Where a rate came from, shown under the BOQ line. */
export const rateRefOf = (s: RateSuggestion) => `${s.item.book === 'civil' ? 'Civil SR' : 'SoR 2023-24'} · ${s.item.sheet} ${s.item.code}${s.item.sr ? ` · ${s.item.sr}` : ''}`;

const CIVIL_SHEET = /civil/i;

/**
 * The catalog item a BOQ line names by its own SoR code ("SR Code" column), when there is exactly one
 * such item in the right part of the catalog and its unit agrees. These are the only matches the app
 * ticks for the user; everything matched by wording waits for a tick.
 */
export function exactCodeMatch(index: RateIndex, line: LineBasis & Pick<EstimateLine, 'srCode'>): RateSuggestion | null {
  const code = line.srCode?.trim().replace(/^(sr|sor)\s*/i, '');
  if (!code) return null;
  const civil = isCivilSection(line.section);
  // A civil item's code is first looked up in the civil schedule of rates, when the user added one.
  if (civil && index.civil) {
    const own = index.civil.items.filter((i) => i.code === code && i.rate !== null);
    const units = new Set(own.map((i) => i.unit));
    // The same code in several sheets is only sure when they all agree on the rate and unit.
    const item = own.length && units.size === 1 && new Set(own.map((i) => i.rate)).size === 1 ? own[0] : undefined;
    if (item && unitFactor(line.unit || item.unit, item.unit) !== null) return { ...suggestionFor(item, line, 1), exact: true };
  }
  const found = index.items.filter((i) => i.code === code && i.rate !== null && SHEETS[line.section](i.sheet) && (!civil || CIVIL_SHEET.test(i.sheet)));
  const item = found.find((i) => i.sheet === 'By code') ?? (found.length === 1 ? found[0] : undefined);
  if (!item) return null;
  const s = suggestionFor(item, line, 1);
  const lb = unitBasis(line.unit);
  return lb !== 'other' && unitFactor(line.unit, item.unit) !== null ? { ...s, exact: true } : null;
}

/** A rate in the estimate far from the SoR item the line surely is. */
export interface OddRate {
  line: EstimateLine;
  /** The SoR item: named by the line's SR code, or a close match (same numbers, unit and near-identical wording). */
  match: RateSuggestion;
  /** The line's supply rate divided by the SoR rate, both in the line's unit. */
  ratio: number;
  /** In words, after "The rate": "is 3.2× the SoR rate". */
  why: string;
}

/** The catalog item a line's rate was taken from, read back from its rateRef ("SoR 2023-24 · By code 1.13 · p25"). */
export function itemOfRateRef(index: RateIndex, rateRef: string | undefined): CatalogItem | null {
  const m = /^(SoR|Civil SR)\b[^·]*·\s*(.+?)\s+(\S+?)(?:\s+·|$)/.exec(rateRef ?? '');
  if (!m) return null;
  const items = m[1] === 'Civil SR' ? (index.civil?.items ?? []) : index.items;
  return items.find((i) => i.sheet === m[2] && i.code === m[3]) ?? null;
}

/** How far a rate may sit from its SoR item before it is shown: 1.5× either way. */
export const ODD_RATE_FACTOR = 1.5;

/**
 * Rates already in the estimate that are far from the SoR item the line names or very closely matches.
 * Only exact-code and close matches are used: on 21 KPTCL workbooks they flag none of the real rates, while
 * looser matches flag mostly wrong matches, not wrong rates.
 */
export function oddRates(index: RateIndex, lines: EstimateLine[]): OddRate[] {
  const out: OddRate[] = [];
  for (const line of lines) {
    if (!(line.supplyRate > 0) || !line.description.trim() || line.section === 'dismantling' || isLabourOnly(line.description)) continue;
    // A rate taken from an SoR item of another voltage or size (an 8 MVA 66/11 kV transformer for a 110/11 kV line).
    const priced = itemOfRateRef(index, line.rateRef);
    const diffs = priced ? ratingDifferences(line, priced) : [];
    if (priced && diffs.length) {
      const s = suggestionFor(priced, line);
      out.push({ line, match: s, ratio: s.supplyRate ? effectiveRate(line, 'supply') / s.supplyRate : 1, why: `was priced from SoR ${priced.code}, which is ${diffs.join(' and ')}` });
      continue;
    }
    let match = exactCodeMatch(index, line);
    if (!match) {
      const top = suggestRates(index, line, 1)[0];
      match = top && isReliable(line, top) ? top : null;
    }
    if (!match || !(match.supplyRate > 0) || !match.unitMatches) continue;
    const ratio = effectiveRate(line, 'supply') / match.supplyRate;
    if (ratio <= ODD_RATE_FACTOR && ratio >= 1 / ODD_RATE_FACTOR) continue;
    const near = (x: number, target: number) => Math.abs(x / target - 1) < 0.2;
    const why =
      near(ratio, 1000) || near(ratio, 1 / 1000)
        ? `looks like a rate for the wrong unit (${ratio > 1 ? '1000×' : '1/1000 of'} the SoR rate, as per km against per metre)`
        : near(ratio, 100) || near(ratio, 1 / 100) || near(ratio, 10) || near(ratio, 1 / 10)
          ? `is ${ratio > 1 ? `${Math.round(ratio)}×` : `1/${Math.round(1 / ratio)} of`} the SoR rate: a misplaced decimal point or zero?`
          : ratio > 1
            ? `is ${ratio.toFixed(1)}× the SoR rate`
            : `is ${Math.round(ratio * 100)}% of the SoR rate`;
    out.push({ line, match, ratio, why });
  }
  return out;
}

/**
 * How a catalog item's rating differs from the BOQ line's: voltage class and the sizes that tell one
 * item from the next (MVA, amperes, sq mm, cores…). Empty when nothing differs. Shown next to the
 * suggestion, so a 66 kV item is never taken for a 110 kV line by mistake.
 */
export function ratingDifferences(line: Pick<EstimateLine, 'description'>, item: CatalogItem): string[] {
  const out: string[] = [];
  const itemText = `${item.item} ${item.context}`;
  const lkv = highestKv(line.description);
  const ikv = itemKv(item);
  if (lkv !== null && ikv.size && !ikv.has(lkv)) out.push(`${Math.max(...ikv)} kV, not ${lkv} kV`);
  const sizes = (t: string) => {
    const m = new Map<string, Set<string>>();
    for (const tok of tokens(t)) {
      const x = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(tok);
      if (x && SIZE_UNITS.includes(x[2]!)) m.set(x[2]!, (m.get(x[2]!) ?? new Set()).add(x[1]!));
    }
    return m;
  };
  const NAMES: Record<string, string> = { mva: 'MVA', sqmm: 'sq mm', a: 'A', kn: 'kN', ah: 'Ah', core: 'core' };
  const theirs = sizes(itemText);
  for (const [unit, values] of sizes(line.description)) {
    const t = theirs.get(unit);
    if (t && ![...values].some((v) => t.has(v))) out.push(`${[...t].join('/')} ${NAMES[unit] ?? unit}, not ${[...values].join('/')} ${NAMES[unit] ?? unit}`);
  }
  return out;
}

/** The SoR item a line surely is: its own SR code, or a match by wording close enough to trust. */
export function certainMatch(index: RateIndex, line: LineBasis & Pick<EstimateLine, 'description' | 'srCode'> & { group?: string }): RateSuggestion | null {
  const exact = exactCodeMatch(index, line);
  if (exact) return exact;
  if (isLabourOnly(line.description)) return null;
  const [top, next] = suggestRates(index, line, 2);
  return top && isReliable(line, top, next ?? null) ? top : null;
}

/** Supply rates further than this from the SoR count as different (0.5%, so rounding never trips it). */
const SAME_RATE = 0.005;
export const differsFromRate = (sor: number, rate: number) => Math.abs(sor - rate) > Math.max(1, SAME_RATE * Math.max(sor, rate));

export interface SorDifference {
  line: EstimateLine;
  match: RateSuggestion;
}

/** Priced lines whose supply rate is not the rate of the SoR item they surely are (rate_catalog is the rate source). */
export function sorDifferences(index: RateIndex, lines: EstimateLine[]): SorDifference[] {
  const out: SorDifference[] = [];
  for (const line of lines) {
    if (!(line.supplyRate > 0)) continue;
    const match = certainMatch(index, line);
    if (match && match.supplyRate > 0 && differsFromRate(match.supplyRate, effectiveRate(line, 'supply'))) out.push({ line, match });
  }
  return out;
}
