import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sampleStore } from '@/lib/sampleStore';
import type { DprDocuments } from './types';

/**
 * Documents are kept in this browser until the backend exists (files themselves are not stored,
 * only their names and sizes). Planned API: GET /api/v1/dprs/{id}/documents, POST .../files,
 * POST .../submit.
 */
export function useDprDocuments(dprId: string) {
  return useQuery({
    queryKey: ['documents', dprId],
    enabled: Boolean(dprId),
    queryFn: () => sampleStore.documents(dprId),
    staleTime: Infinity,
  });
}

export function useUpdateDocuments(dprId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: (current: DprDocuments) => DprDocuments) =>
      sampleStore.saveDocuments(dprId, change(sampleStore.documents(dprId))),
    onSuccess: (docs) => qc.setQueryData(['documents', dprId], docs),
  });
}
