import { useEffect, useState } from 'react';
import { buildIndex, type RateIndex } from './match';
import { clearSavedCatalog, getSavedCatalog, putSavedCatalog, type SavedCatalog } from './catalogStore';
import type { RateCatalog } from './types';

let builtIn: Promise<RateCatalog> | null = null;
let cached: Promise<RateCatalog> | null = null;

/** The catalog shipped with the app (rate_catalog 76.xlsx). It is large (≈2.5 MB), so it loads only when asked for. */
export function loadBuiltInCatalog(): Promise<RateCatalog> {
  builtIn ??= import('@/data/rateCatalog.json').then((m) => (m.default ?? m) as RateCatalog);
  return builtIn;
}

/**
 * The rate catalog every price comes from: the one the user keeps in the Rate Catalog page, or the
 * built-in one until they upload or edit their own.
 */
export function loadRateCatalog(): Promise<RateCatalog> {
  cached ??= getSavedCatalog()
    .catch(() => null)
    .then((s) => s?.catalog ?? loadBuiltInCatalog());
  return cached;
}

const listeners = new Set<() => void>();

/** Calls `fn` whenever the user changes the catalog. Returns the unsubscribe. */
export function onCatalogChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function changed() {
  cached = null;
  for (const fn of [...listeners]) fn();
}

/** Makes this the catalog every price comes from. False when it could be kept for this page view only. */
export async function saveCatalog(saved: SavedCatalog): Promise<boolean> {
  const ok = await putSavedCatalog(saved);
  changed();
  return ok;
}

/** Goes back to the catalog shipped with the app, dropping the user's upload and edits. */
export async function restoreBuiltInCatalog(): Promise<void> {
  await clearSavedCatalog();
  changed();
}

/** "rate_catalog 76.xlsx" → "rate_catalog 76", for sentences like "differs from the SoR (rate_catalog 76)". */
export const catalogName = (c: Pick<RateCatalog, 'source'> | null | undefined) => (c?.source ?? 'rate catalog').replace(/\.xls[xm]?$/i, '');

const indexes = new WeakMap<RateCatalog, RateIndex>();
const indexOf = (c: RateCatalog) => {
  let i = indexes.get(c);
  if (!i) indexes.set(c, (i = buildIndex(c)));
  return i;
};

/** The active catalog and its match index, loaded when `enabled`, and loaded again whenever the user changes it. */
export function useRateCatalog(enabled = true): { catalog: RateCatalog | null; index: RateIndex | null; failed: boolean } {
  const [state, setState] = useState<{ catalog: RateCatalog | null; index: RateIndex | null; failed: boolean }>({ catalog: null, index: null, failed: false });
  const [version, setVersion] = useState(0);
  useEffect(() => onCatalogChange(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadRateCatalog()
      .then((c) => live && setState({ catalog: c, index: indexOf(c), failed: false }))
      .catch(() => live && setState((s) => ({ ...s, failed: true })));
    return () => {
      live = false;
    };
  }, [enabled, version]);
  return state;
}
