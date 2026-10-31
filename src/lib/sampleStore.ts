import type { DprRow } from '@/features/reports/types';
import { readJson, writeJson } from './storage';

/**
 * Stand-in for the backend while no API is configured.
 * DPRs created on the Initialization page are kept in this browser's localStorage,
 * so the dashboard and reports reflect them. It starts empty.
 */
const KEY = 'dpr-manager.sample-dprs.v1';

export const sampleStore = {
  list(): DprRow[] {
    return readJson<DprRow[]>(KEY, []);
  },
  add(row: DprRow): DprRow {
    writeJson(KEY, [row, ...sampleStore.list()]);
    return row;
  },
  clear(): void {
    writeJson(KEY, []);
  },
};
