import { useEffect, useState } from 'react';
import { readJson, writeJson } from '@/lib/storage';

/** useState that is remembered in localStorage across reloads. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJson(key, initial));
  useEffect(() => writeJson(key, value), [key, value]);
  return [value, setValue] as const;
}
