import type { DprRow } from '@/features/reports/types';
import { EMPTY_DOCUMENTS, type DprDocuments } from '@/features/documents/types';
import type { Estimate } from '@/features/preparation/types';
import type { BoqReadResult } from '@/features/boq-import/types';
import { readJson, writeJson } from './storage';

/**
 * Stand-in for the backend while no API is configured.
 * DPRs created on the Initialization page are kept in this browser's localStorage,
 * so the dashboard and reports reflect them. It starts empty.
 */
const KEY = 'dpr-manager.sample-dprs.v1';
const DOCS_KEY = 'dpr-manager.sample-documents.v1';
const ESTIMATES_KEY = 'dpr-manager.sample-estimates.v1';
const BOQ_READS_KEY = 'dpr-manager.sample-boq-reads.v1';

/** BOQ files read for a DPR, by document key. */
export type BoqReads = Record<string, BoqReadResult[]>;

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
  estimate(dprId: string): Estimate | null {
    return readJson<Record<string, Estimate>>(ESTIMATES_KEY, {})[dprId] ?? null;
  },
  saveEstimate(dprId: string, estimate: Estimate): Estimate {
    writeJson(ESTIMATES_KEY, { ...readJson<Record<string, Estimate>>(ESTIMATES_KEY, {}), [dprId]: estimate });
    return estimate;
  },
  boqReads(dprId: string): BoqReads {
    return readJson<Record<string, BoqReads>>(BOQ_READS_KEY, {})[dprId] ?? {};
  },
  /** Keeps one reading per file name: attaching a file with the same name again replaces it. */
  saveBoqRead(dprId: string, docKey: string, read: BoqReadResult): BoqReads {
    const all = readJson<Record<string, BoqReads>>(BOQ_READS_KEY, {});
    const mine = all[dprId] ?? {};
    const next = { ...mine, [docKey]: [...(mine[docKey] ?? []).filter((r) => r.fileName !== read.fileName), read] };
    writeJson(BOQ_READS_KEY, { ...all, [dprId]: next });
    return next;
  },
  removeBoqRead(dprId: string, docKey: string, fileName: string): BoqReads {
    const all = readJson<Record<string, BoqReads>>(BOQ_READS_KEY, {});
    const mine = all[dprId] ?? {};
    const next = { ...mine, [docKey]: (mine[docKey] ?? []).filter((r) => r.fileName !== fileName) };
    writeJson(BOQ_READS_KEY, { ...all, [dprId]: next });
    return next;
  },
  clear(): void {
    writeJson(BOQ_READS_KEY, {});
    writeJson(KEY, []);
    writeJson(DOCS_KEY, {});
    writeJson(ESTIMATES_KEY, {});
  },
};
