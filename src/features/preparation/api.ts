import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sampleStore } from '@/lib/sampleStore';
import type { DprRow } from '@/features/reports/types';
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
    queryFn: () => sampleStore.estimate(dpr!.id) ?? buildTemplate(dpr!),
  });
}

export function useSaveEstimate(dprId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Estimate) => sampleStore.saveEstimate(dprId, { ...e, updatedAt: new Date().toISOString() }),
    onMutate: (e) => qc.setQueryData(['estimate', dprId], e),
  });
}
