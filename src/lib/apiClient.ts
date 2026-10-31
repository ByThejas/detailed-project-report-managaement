const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** True when no backend is configured and the app runs on sample data. */
export const useSampleData = BASE_URL === '';

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) throw new ApiError(`${method} ${path} failed`, res.status);
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal);
export const apiPost = <T>(path: string, body: unknown) => request<T>('POST', path, body);
