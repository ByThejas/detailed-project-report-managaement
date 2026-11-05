import type { EstimateLine } from '@/features/preparation/types';
import { readJson, writeJson } from '@/lib/storage';
import { itemText, suggestionFor, tokens, unitBasis, type RateIndex, type RateSuggestion } from './match';
import type { CatalogItem } from './types';

/**
 * Catalog items the user chose for BOQ wording, kept in this browser, so the same wording in the next
 * DPR is offered the same item first ("Your earlier choice"). It is still only applied when ticked.
 */
const STORE_KEY = 'dpr.rateChoices.v1';
const MAX_CHOICES = 3000;

interface Remembered {
  itemId: string;
  at: string;
}

type Line = Pick<EstimateLine, 'section' | 'description' | 'unit' | 'group'>;

/** Same part, same words (in any order), same heading words and same kind of unit: the same BOQ item. */
export function choiceKey(line: Line): string {
  const words = (t: string) => [...new Set(tokens(t))].sort().join(' ');
  return [line.section, words(itemText(line.description)), words(line.group ?? ''), unitBasis(line.unit)].join('|');
}

/** Remembers the item applied to each line. Items taken by the line's own SR code need no memory. */
export function rememberChoices(applied: { line: Line; suggestion: RateSuggestion }[], now = new Date()): void {
  const store = readJson<Record<string, Remembered>>(STORE_KEY, {});
  for (const { line, suggestion } of applied) {
    if (suggestion.exact || !line.description.trim()) continue;
    store[choiceKey(line)] = { itemId: suggestion.item.id, at: now.toISOString() };
  }
  const entries = Object.entries(store);
  // Keep the newest choices when the store grows past its limit.
  const kept = entries.length > MAX_CHOICES ? entries.sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, MAX_CHOICES) : entries;
  writeJson(STORE_KEY, Object.fromEntries(kept));
}

const byId = new WeakMap<RateIndex, Map<string, CatalogItem>>();

/** The item chosen before for each line's wording, priced for that line, by line id. */
export function recalledChoices(index: RateIndex, lines: (Line & Pick<EstimateLine, 'id' | 'qty'>)[]): Map<string, RateSuggestion> {
  const out = new Map<string, RateSuggestion>();
  const store = readJson<Record<string, Remembered>>(STORE_KEY, {});
  if (!Object.keys(store).length) return out;
  let items = byId.get(index);
  if (!items) byId.set(index, (items = new Map(index.items.map((i) => [i.id, i]))));
  for (const line of lines) {
    const r = store[choiceKey(line)];
    const item = r && items.get(r.itemId);
    if (item) out.set(line.id, { ...suggestionFor(item, line, 1), remembered: true });
  }
  return out;
}

/** Forgets every remembered choice. */
export const forgetChoices = () => writeJson(STORE_KEY, {});

export const rememberedCount = () => Object.keys(readJson<Record<string, Remembered>>(STORE_KEY, {})).length;
