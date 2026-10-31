import { useQuery } from '@tanstack/react-query';
import { apiGet, useSampleData } from '@/lib/apiClient';
import { sampleStore } from '@/lib/sampleStore';
import { programmeReportsSample } from '@/mocks/reports';
import type { DprRow, ProgrammeReport } from './types';

export function useProgrammeReports() {
  return useQuery({
    queryKey: ['reports', 'programme'],
    queryFn: ({ signal }) =>
      useSampleData ? Promise.resolve(programmeReportsSample) : apiGet<ProgrammeReport[]>('/api/v1/reports/programme', signal),
    staleTime: Infinity,
  });
}

export function useDprRegister() {
  return useQuery({
    queryKey: ['dprs', 'list'],
    queryFn: ({ signal }) => (useSampleData ? Promise.resolve(sampleStore.list()) : apiGet<DprRow[]>('/api/v1/dprs', signal)),
    staleTime: 60_000,
  });
}
