import type { RateCatalog } from './types';

let cached: Promise<RateCatalog> | null = null;

/** The rate catalog is large (≈2.5 MB), so it is loaded only when pricing is asked for. */
export function loadRateCatalog(): Promise<RateCatalog> {
  cached ??= import('@/data/rateCatalog.json').then((m) => (m.default ?? m) as RateCatalog);
  return cached;
}
