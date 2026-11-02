import '@testing-library/jest-dom/vitest';

/**
 * Node 25 ships its own `localStorage`, which is a stub without methods unless Node is started with
 * `--localstorage-file`. Under Vitest's jsdom environment it hides jsdom's working one, so every test
 * failed on `localStorage.clear is not a function`. Put a plain in-memory Storage in its place.
 */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(String(k)) ?? null,
    setItem: (k: string, v: string) => void data.set(String(k), String(v)),
    removeItem: (k: string) => void data.delete(String(k)),
    clear: () => data.clear(),
  };
}

const works = (s: Storage | undefined) => {
  try {
    return typeof s?.clear === 'function' && typeof s.setItem === 'function';
  } catch {
    return false;
  }
};

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!works(window[name])) {
    const storage = memoryStorage();
    Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
    Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
  }
}

/**
 * Node 24+ checks that a Request's `signal` is Node's own AbortSignal, but under jsdom the AbortController
 * that React Router uses is jsdom's, so navigation threw "Expected signal to be an instance of AbortSignal".
 * Tests don't need to abort requests, so drop a foreign signal.
 */
try {
  new Request('http://localhost/', { signal: new AbortController().signal });
} catch {
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        super(input, { ...init, signal: undefined });
      } else super(input, init);
    }
  } as typeof Request;
}

beforeEach(() => window.localStorage.clear());
