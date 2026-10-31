import type { DprRow } from '@/features/reports/types';
import { EMPTY_DOCUMENTS, type DprDocuments } from '@/features/documents/types';
import { readJson, writeJson } from './storage';

/**
 * Stand-in for the backend while no API is configured.
 * DPRs created on the Initialization page are kept in this browser's localStorage,
 * so the dashboard and reports reflect them. It starts empty.
 */
const KEY = 'dpr-manager.sample-dprs.v1';
const DOCS_KEY = 'dpr-manager.sample-documents.v1';

export const sampleStore = {
  list(): DprRow[] {
    return readJson<DprRow[]>(KEY, []);
  },
  add(row: DprRow): DprRow {
    writeJson(KEY, [row, ...sampleStore.list()]);
    return row;
  },
  documents(dprId: string): DprDocuments {
    return readJson<Record<string, DprDocuments>>(DOCS_KEY, {})[dprId] ?? EMPTY_DOCUMENTS;
  },
  saveDocuments(dprId: string, docs: DprDocuments): DprDocuments {
    writeJson(DOCS_KEY, { ...readJson<Record<string, DprDocuments>>(DOCS_KEY, {}), [dprId]: docs });
    return docs;
  },
  clear(): void {
    writeJson(KEY, []);
    writeJson(DOCS_KEY, {});
  },
};
