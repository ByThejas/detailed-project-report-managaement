import { useQuery } from '@tanstack/react-query';
import { apiGet, useSampleData } from '@/lib/apiClient';
import { sampleStore } from '@/lib/sampleStore';
import { summarise } from './summary';
import type { DashboardSummary } from './types';

export async function fetchDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  if (useSampleData) return summarise(sampleStore.list());
  return apiGet<DashboardSummary>('/api/v1/dashboard/summary', signal);
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dprs', 'summary'],
    queryFn: ({ signal }) => fetchDashboardSummary(signal),
    staleTime: 60_000,
  });
}
