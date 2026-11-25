import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sampleStore } from '@/lib/sampleStore';
import type { DprRow } from '@/features/reports/types';
import { addFileHeadings, dropPresets } from '@/features/boq-import/toEstimateLine';
import { buildTemplate } from './template';
import type { Estimate } from './types';

/**
 * The DPR's estimate, or a fresh template built from its capacity and voltage. Kept in this
 * browser until the backend exists (planned: GET/PUT /api/v1/dprs/{id}/estimate).
 */
export function useEstimate(dpr: DprRow | undefined) {
  return useQuery({
    queryKey: ['estimate', dpr?.id],
    enabled: Boolean(dpr),
    staleTime: Infinity,
    queryFn: () => {
      flushEstimateSaves();
      const saved = sampleStore.estimate(dpr!.id);
      // An estimate imported before heading rows were kept gets them from the file's saved reading.
      // An estimate made from an uploaded workbook drops what is left of the sample template (items, loading, statutory charge).
      const reads = Object.values(sampleStore.boqReads(dpr!.id)).flat();
      return saved ? dropPresets(addFileHeadings(saved, reads), reads) : buildTemplate(dpr!);
    },
  });
}

/**
 * Typing in the DPR saves the whole estimate (every DPR's, in one storage entry), which took a
 * noticeable moment per keystroke on large estimates. The screen updates at once from the query
 * cache; the write waits until typing pauses, and is flushed when the page is hidden or closed.
 */
const SAVE_DELAY_MS = 350;
interface Pending {
  estimate: Estimate;
  timer: ReturnType<typeof setTimeout>;
  waiters: { resolve: (e: Estimate) => void; reject: (err: unknown) => void }[];
}
const pending = new Map<string, Pending>();

function write(dprId: string) {
  const p = pending.get(dprId);
  if (!p) return;
  pending.delete(dprId);
  clearTimeout(p.timer);
  const last = p.waiters.pop()!;
  try {
    const saved = sampleStore.saveEstimate(dprId, p.estimate);
    for (const w of p.waiters) w.resolve(saved);
    last.resolve(saved);
  } catch (err) {
    // One failure toast for the burst, not one per keystroke.
    for (const w of p.waiters) w.resolve(p.estimate);
    last.reject(err);
  }
}

/** Writes any estimate still waiting to be saved. */
export function flushEstimateSaves() {
  for (const id of [...pending.keys()]) write(id);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushEstimateSaves);
  window.addEventListener('beforeunload', flushEstimateSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEstimateSaves();
  });
}

function saveSoon(dprId: string, estimate: Estimate): Promise<Estimate> {
  return new Promise((resolve, reject) => {
    const p = pending.get(dprId);
    if (p) clearTimeout(p.timer);
    const next: Pending = { estimate, waiters: [...(p?.waiters ?? []), { resolve, reject }], timer: setTimeout(() => write(dprId), SAVE_DELAY_MS) };
    pending.set(dprId, next);
  });
}

export function useSaveEstimate(dprId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: Estimate) => saveSoon(dprId, { ...e, updatedAt: new Date().toISOString() }),
    onMutate: (e) => qc.setQueryData(['estimate', dprId], e),
  });
}
