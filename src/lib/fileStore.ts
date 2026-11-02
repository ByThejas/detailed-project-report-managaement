/**
 * Keeps the attached files themselves (not just their names) in this browser's IndexedDB, so the app can
 * put them into the printed DPR pack. Until there is a backend, files live only in this browser.
 * Every call is safe when IndexedDB is unavailable: it does nothing and returns nothing.
 */
const DB = 'dpr-manager-files';
const STORE = 'files';

export interface StoredFile {
  dprId: string;
  docKey: string;
  name: string;
  type: string;
  /** The file's bytes. */
  data: ArrayBuffer;
  savedAt: string;
}

const keyOf = (dprId: string, docKey: string, name: string) => `${dprId}|${docKey}|${name}`;

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

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => (db.close(), resolve(req.result));
      tx.onerror = tx.onabort = () => (db.close(), resolve(undefined));
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

/** Stores the files under the DPR and document. A file with the same name replaces the old one. */
export async function putFiles(dprId: string, docKey: string, files: File[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  for (const f of files) {
    // Read the bytes now: a File handle may not outlive the page in every browser.
    const data = await blobBytes(f);
    const rec: StoredFile = { dprId, docKey, name: f.name, type: f.type, data, savedAt: new Date().toISOString() };
    await run('readwrite', (s) => s.put(rec, keyOf(dprId, docKey, f.name)));
  }
}

export const getFile = (dprId: string, docKey: string, name: string) => run<StoredFile | undefined>('readonly', (s) => s.get(keyOf(dprId, docKey, name)));

export const deleteFile = (dprId: string, docKey: string, name: string) => run('readwrite', (s) => s.delete(keyOf(dprId, docKey, name)));

/** The file's bytes; works with jsdom's Blob too, which lacks arrayBuffer(). */
export function blobBytes(b: Blob): Promise<ArrayBuffer> {
  if (typeof b.arrayBuffer === 'function') return b.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}
