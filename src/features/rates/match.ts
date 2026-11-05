import type { EstimateLine, EstimateSection } from '@/features/preparation/types';
import type { CatalogChildRate, CatalogItem, RateCatalog } from './types';

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
      .replace(/(\d)\s*(kv|mva|kva|ka|mm|sqmm|mt|v|a|ah|w|kn)\b/g, '$1 $2')
      .match(/\d+(?:\.\d+)?|[a-z]+/g) ?? []
  )
    // "6.0" and "6" are the same number.
    .map((t) => (/^\d+\.\d+$/.test(t) ? String(Number(t)) : singular(t)))
    .filter((t) => !STOP.has(t) && (t.length > 1 || /\d/.test(t) || t === 'a'));
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

/** Rated equipment voltages name their system voltage: a 72.5 kV breaker is for a 66 kV system. */
const EQUIPMENT_KV: Record<number, number> = { 12: 11, 36: 33, 72.5: 66, 123: 110, 145: 132, 245: 220, 420: 400 };

/** The highest voltage class (kV) named in a text, e.g. "110/11 kV" → 110. Null when none is named. */
export function highestKv(text: string): number | null {
  // "110/33-11 kV" is a 110 kV item: the first of a run of voltages joined by "/" or "-" is the highest.
  const found = [...text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(?:[/-]\s*\d+(?:\.\d+)?\s*)*kv\b/g)].map((m) => EQUIPMENT_KV[Number(m[1])] ?? Number(m[1]));
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
 * Child rates that apply per unit of the line, and those that need another basis. A per-tonne rate is
 * turned into a rate per No when the line carries its tonnage ("No (6.907 MT)"), as KPTCL does for
 * structures and towers (erection Rs/MT × tonnes ÷ number).
 */
function splitChildren(children: CatalogChildRate[], line: LineBasis, itemUnit: string) {
  let sum = 0;
  const notApplied: CatalogChildRate[] = [];
  const converted: string[] = [];
  const lb = unitBasis(line.unit);
  const ib = unitBasis(itemUnit);
  const b = line.basis ?? {};
  const lineTonnes = tonnesOf(line.unit);
  const tonnes = b.tonnes ?? (lineTonnes && line.qty && line.qty > 0 ? lineTonnes / line.qty : undefined);
  for (const c of children) {
    const cb = unitBasis(c.unit);
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
    } else if (isSetBasis(cb) && lb === 'no' && b.setNos) {
      // The estimator says how many Nos of the BOQ make one Set of the SoR.
      sum += c.rate / b.setNos;
      converted.push(`${formatRate(c.rate)} per ${c.unit} ÷ ${b.setNos} = ${formatRate(r2(c.rate / b.setNos))} per No`);
    } else notApplied.push(c);
  }
  return { total: sum, notApplied, converted };
}

const formatRate = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const OPPOSITES: [string, string][] = [
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
];
const PART_WORDS = ['bolt', 'nut', 'washer'];
/** Conductor names: hardware and joints are priced per conductor, so the line must name the same one. */
const CONDUCTORS = ['moose', 'coyote', 'drake', 'lynx', 'panther', 'zebra', 'bersimis', 'rabbit', 'weasel', 'dog', 'wolf', 'hpc', 'htls'];

/** The part of a BOQ description that names the item: notes and working ("Note:- For stringing 2nd circuit = …") are cut off. */
export const itemText = (description: string) => description.split(/\bnote\s*[:-]|\bnotes?\s*\d\)/i)[0]!.trim() || description;

export function suggestRates(index: RateIndex, line: LineBasis & Pick<EstimateLine, 'description'> & { group?: string }, max = 3): RateSuggestion[] {
  const own = new Set(tokens(itemText(line.description)));
  // Words of the headings the line sits under ("Fabrication and supply of towers" over "a) Normal tower") help, at a lower weight.
  const fromGroup = new Set(tokens(line.group ?? '').filter((t) => !own.has(t)));
  const lt = [...own, ...fromGroup];
  if (!own.size) return [];
  const weight = (t: string) => (index.idf.get(t) ?? Math.log(1 + index.items.length)) * (fromGroup.has(t) ? 0.6 : 1);
  const sizes = (set: Iterable<string>) => {
    const out = new Map<string, Set<string>>();
    for (const t of set) {
      const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(t);
      if (m && SIZE_UNITS.includes(m[2]!)) out.set(m[2]!, (out.get(m[2]!) ?? new Set()).add(m[1]!));
    }
    return out;
  };
  const lineSizes = sizes(own);
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
    // A line priced by weight or length (towers in MT, conductor in km) is never a counted item, and the reverse.
    if (lu !== 'other' && iu !== 'other' && lu !== iu) score *= (lu === 'count') !== (iu === 'count') ? 0.5 : 0.7;
    // A different voltage class is a different item (a 66 kV transformer is not a 110 kV one).
    const hv = lineHv;
    const ihv = index.hv[i];
    if (hv !== null && ihv !== null && hv !== ihv) score *= 0.6;
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
    scored.push({ i, score, shared });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map(({ i, score, shared }) => suggestionFor(index.items[i]!, line, Math.min(1, score), shared));
}

/** Rates a catalog item gives a BOQ line: supply, plus the labour and T&C rates that are in the line's unit. */
export function suggestionFor(item: CatalogItem, line: LineBasis, score = 1, shared = 0): RateSuggestion {
  const multi = line.section === 'electrical' || line.section === 'line';
  const labour = splitChildren(item.labour, line, item.unit);
  const tc = splitChildren(item.tc, line, item.unit);
  const lb = unitBasis(line.unit);
  const ib = unitBasis(item.unit);
  const setNos = line.basis?.setNos;
  // A supply rate per Set on a line in Nos, once the estimator has said how many Nos a Set is.
  const f = lb === 'no' && isSetBasis(ib) && setNos ? 1 / setNos : unitFactor(line.unit, item.unit);
  return {
    item,
    score,
    shared,
    supplyRate: (item.rate ?? 0) * (f !== null && f !== 1 ? f : 1),
    erectionRate: multi ? labour.total : 0,
    testingRate: multi ? tc.total : 0,
    notApplied: multi ? [...labour.notApplied, ...tc.notApplied] : [],
    converted: multi ? [...labour.converted, ...tc.converted] : [],
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
  return {
    line: {
      ...line,
      supplyRate: s.supplyRate,
      erectionRate: pick(s.erectionRate, line.erectionRate, 'erection'),
      testingRate: pick(s.testingRate, line.testingRate, 'testing'),
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

/** A match close enough to tick for the user: very close wording, every number in the BOQ line also in the item, same unit. */
export const RELIABLE_SCORE = 0.85;
const numbersOf = (t: string) => t.toLowerCase().match(/\d+(?:\.\d+)?/g) ?? [];
export function isReliable(line: Pick<EstimateLine, 'description'> & { group?: string }, s: RateSuggestion): boolean {
  // A fragment such as "For 66kV Line" (the item's name sits in a heading above it) says too little to trust.
  if (s.score < RELIABLE_SCORE || !s.unitMatches || isLabourOnly(line.description) || new Set(tokens(line.description)).size < 4) return false;
  // An item for one conductor (Moose) is only trusted when the line or its heading names that conductor.
  const itemToks = new Set(tokens(`${s.item.item} ${s.item.context}`));
  const lineToks = new Set(tokens(`${line.description} ${line.group ?? ''}`));
  if (CONDUCTORS.some((c) => itemToks.has(c) && !lineToks.has(c))) return false;
  const have = new Set(numbersOf(`${s.item.item} ${s.item.context}`));
  return numbersOf(line.description).every((n) => have.has(n));
}

/** Where a rate came from, shown under the BOQ line. */
export const rateRefOf = (s: RateSuggestion) => `SoR 2023-24 · ${s.item.sheet} ${s.item.code}${s.item.sr ? ` · ${s.item.sr}` : ''}`;

const CIVIL_SHEET = /civil/i;

/**
 * The catalog item a BOQ line names by its own SoR code ("SR Code" column), when there is exactly one
 * such item in the right part of the catalog and its unit agrees. These are the only matches the app
 * ticks for the user; everything matched by wording waits for a tick.
 */
export function exactCodeMatch(index: RateIndex, line: LineBasis & Pick<EstimateLine, 'srCode'>): RateSuggestion | null {
  const code = line.srCode?.trim().replace(/^(sr|sor)\s*/i, '');
  if (!code) return null;
  const civil = line.section === 'civil' || line.section === 'lineCivil';
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
  const m = /^SoR [^·]*·\s*(.+?)\s+(\S+?)(?:\s+·|$)/.exec(rateRef ?? '');
  if (!m) return null;
  return index.items.find((i) => i.sheet === m[1] && i.code === m[2]) ?? null;
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
      out.push({ line, match: s, ratio: s.supplyRate ? line.supplyRate / s.supplyRate : 1, why: `was priced from SoR ${priced.code}, which is ${diffs.join(' and ')}` });
      continue;
    }
    let match = exactCodeMatch(index, line);
    if (!match) {
      const top = suggestRates(index, line, 1)[0];
      match = top && isReliable(line, top) ? top : null;
    }
    if (!match || !(match.supplyRate > 0) || !match.unitMatches) continue;
    const ratio = line.supplyRate / match.supplyRate;
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
  const ikv = highestKv(itemText);
  if (lkv !== null && ikv !== null && lkv !== ikv) out.push(`${ikv} kV, not ${lkv} kV`);
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
