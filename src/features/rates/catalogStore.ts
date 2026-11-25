import type { CatalogBook, RateCatalog } from './types';

/**
 * The rate catalogs the user keeps in the Rate Catalog page, saved in this browser's IndexedDB (the
 * electrical one is ≈2.5 MB, too big for localStorage). Until there is a backend they live in this
 * browser only. When IndexedDB is unavailable (tests, blocked storage) they are kept in memory for this
 * page view. The electrical SoR and the civil schedule of rates are kept apart, under their own keys.
 */
const DB = 'dpr-manager-rates';
const STORE = 'catalog';
const KEYS: Record<CatalogBook, string> = { electrical: 'active', civil: 'civil' };

/** What the user changed by hand: the rates an item had before, so an edit can be undone. */
export interface ItemEdit {
  at: string;
  was: { rate: number | null; labour: number[]; tc: number[] };
}

export interface SavedCatalog {
  catalog: RateCatalog;
  /** When the catalog was uploaded (or the built-in one first edited). */
  savedAt: string;
  /** File it came from; blank when it started as the built-in catalog (or, for civil, was typed in here). */
  fileName: string;
  edits: Record<string, ItemEdit>;
  /** Ids of items the user added by hand (civil catalog). */
  added?: string[];
}

const memory: Record<CatalogBook, SavedCatalog | null> = { electrical: null, civil: null };

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }> {
  const db = await open();
  if (!db) return { ok: false };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => (db.close(), resolve({ ok: true, value: req.result }));
      tx.onerror = tx.onabort = () => (db.close(), resolve({ ok: false }));
    } catch {
      db.close();
      resolve({ ok: false });
    }
  });
}

/** The user's catalog: for electrical, null while they use the built-in one; for civil, null until they add one. */
export async function getSavedCatalog(book: CatalogBook = 'electrical'): Promise<SavedCatalog | null> {
  const r = await run<SavedCatalog | undefined>('readonly', (s) => s.get(KEYS[book]));
  return r.ok ? (r.value ?? null) : memory[book];
}

/** Keeps the catalog. Returns false when it could only be kept for this page view. */
export async function putSavedCatalog(saved: SavedCatalog, book: CatalogBook = 'electrical'): Promise<boolean> {
  memory[book] = saved;
  return (await run('readwrite', (s) => s.put(saved, KEYS[book]))).ok;
}

/** Drops the saved catalog: back to the built-in electrical one, or no civil catalog at all. */
export async function clearSavedCatalog(book: CatalogBook = 'electrical'): Promise<void> {
  memory[book] = null;
  await run('readwrite', (s) => s.delete(KEYS[book]));
}
