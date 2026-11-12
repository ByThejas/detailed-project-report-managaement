import type { RateCatalog } from './types';

/**
 * The rate catalog the user keeps in the Rate Catalog page, saved in this browser's IndexedDB (it is
 * ≈2.5 MB, too big for localStorage). Until there is a backend it lives in this browser only. When
 * IndexedDB is unavailable (tests, blocked storage) it is kept in memory for this page view.
 */
const DB = 'dpr-manager-rates';
const STORE = 'catalog';
const KEY = 'active';

/** What the user changed by hand: the rates an item had before, so an edit can be undone. */
export interface ItemEdit {
  at: string;
  was: { rate: number | null; labour: number[]; tc: number[] };
}

export interface SavedCatalog {
  catalog: RateCatalog;
  /** When the catalog was uploaded (or the built-in one first edited). */
  savedAt: string;
  /** File it came from; blank when it started as the built-in catalog. */
  fileName: string;
  edits: Record<string, ItemEdit>;
}

let memory: SavedCatalog | null = null;

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

/** The user's catalog, or null when they use the built-in one. */
export async function getSavedCatalog(): Promise<SavedCatalog | null> {
  const r = await run<SavedCatalog | undefined>('readonly', (s) => s.get(KEY));
  return r.ok ? (r.value ?? null) : memory;
}

/** Keeps the catalog. Returns false when it could only be kept for this page view. */
export async function putSavedCatalog(saved: SavedCatalog): Promise<boolean> {
  memory = saved;
  return (await run('readwrite', (s) => s.put(saved, KEY))).ok;
}

/** Goes back to the built-in catalog. */
export async function clearSavedCatalog(): Promise<void> {
  memory = null;
  await run('readwrite', (s) => s.delete(KEY));
}
