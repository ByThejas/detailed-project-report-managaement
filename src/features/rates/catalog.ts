import { useEffect, useState } from 'react';
import { buildIndex, type RateIndex } from './match';
import { clearSavedCatalog, getSavedCatalog, putSavedCatalog, type SavedCatalog } from './catalogStore';
import type { CatalogBook, RateCatalog } from './types';

let builtIn: Promise<RateCatalog> | null = null;
let cached: Promise<RateCatalog> | null = null;
let cachedCivil: Promise<RateCatalog | null> | null = null;

/** The catalog shipped with the app (rate_catalog 76.xlsx). It is large (≈2.5 MB), so it loads only when asked for. */
export function loadBuiltInCatalog(): Promise<RateCatalog> {
  builtIn ??= import('@/data/rateCatalog.json').then((m) => (m.default ?? m) as RateCatalog);
  return builtIn;
}

/**
 * The electrical rate catalog every price comes from: the one the user keeps in the Rate Catalog page, or
 * the built-in one until they upload or edit their own.
 */
export function loadRateCatalog(): Promise<RateCatalog> {
  cached ??= getSavedCatalog()
    .catch(() => null)
    .then((s) => s?.catalog ?? loadBuiltInCatalog());
  return cached;
}

/** The civil schedule of rates the user added in the Rate Catalog page, or null when there is none. */
export function loadCivilCatalog(): Promise<RateCatalog | null> {
  cachedCivil ??= getSavedCatalog('civil')
    .catch(() => null)
    .then((s) => (s?.catalog.items.length ? s.catalog : null));
  return cachedCivil;
}

const listeners = new Set<() => void>();

/** Calls `fn` whenever the user changes either catalog. Returns the unsubscribe. */
export function onCatalogChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function changed(book: CatalogBook) {
  if (book === 'civil') cachedCivil = null;
  else cached = null;
  for (const fn of [...listeners]) fn();
}

/** Makes this the catalog every price (of that book) comes from. False when it could be kept for this page view only. */
export async function saveCatalog(saved: SavedCatalog, book: CatalogBook = 'electrical'): Promise<boolean> {
  const ok = await putSavedCatalog(saved, book);
  changed(book);
  return ok;
}

/** Goes back to the catalog shipped with the app, dropping the user's upload and edits. */
export async function restoreBuiltInCatalog(): Promise<void> {
  await clearSavedCatalog();
  changed('electrical');
}

/** Drops the civil catalog: civil items are then matched against the electrical SoR's civil sheet only. */
export async function removeCivilCatalog(): Promise<void> {
  await clearSavedCatalog('civil');
  changed('civil');
}

/** "rate_catalog 76.xlsx" → "rate_catalog 76", for sentences like "differs from the SoR (rate_catalog 76)". */
export const catalogName = (c: Pick<RateCatalog, 'source'> | null | undefined) => (c?.source ?? 'rate catalog').replace(/\.xls[xm]?$/i, '');

// One index per pair of catalogs: rebuilt only when either changes.
const indexes = new WeakMap<RateCatalog, { civil: RateCatalog | null; index: RateIndex }>();
const indexOf = (c: RateCatalog, civil: RateCatalog | null) => {
  let i = indexes.get(c);
  if (!i || i.civil !== civil) indexes.set(c, (i = { civil, index: buildIndex(c, civil) }));
  return i.index;
};

interface CatalogState {
  /** The electrical SoR. */
  catalog: RateCatalog | null;
  /** The civil schedule of rates, when the user added one. */
  civil: RateCatalog | null;
  /** Match index over both: civil BOQ items are matched against the civil catalog too. */
  index: RateIndex | null;
  failed: boolean;
}

/** The active catalogs and their match index, loaded when `enabled`, and loaded again whenever the user changes one. */
export function useRateCatalog(enabled = true): CatalogState {
  const [state, setState] = useState<CatalogState>({ catalog: null, civil: null, index: null, failed: false });
  const [version, setVersion] = useState(0);
  useEffect(() => onCatalogChange(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    Promise.all([loadRateCatalog(), loadCivilCatalog().catch(() => null)])
      .then(([c, civil]) => live && setState({ catalog: c, civil, index: indexOf(c, civil), failed: false }))
      .catch(() => live && setState((s) => ({ ...s, failed: true })));
    return () => {
      live = false;
    };
  }, [enabled, version]);
  return state;
}
