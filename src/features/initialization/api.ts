import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, useSampleData } from '@/lib/apiClient';
import { sampleStore } from '@/lib/sampleStore';
import { circlesSample, divisionsSample } from '@/mocks/masterData';
import { approvalRouteFor } from './routing';
import type { Circle, CreatedDpr, Division, NewDprRequest } from './types';

export function useCircles() {
  return useQuery({
    queryKey: ['master', 'circles'],
    queryFn: ({ signal }) => (useSampleData ? Promise.resolve(circlesSample) : apiGet<Circle[]>('/api/v1/circles', signal)),
    staleTime: Infinity,
  });
}

export function useDivisions(circleId: string | undefined) {
  return useQuery({
    queryKey: ['master', 'divisions', circleId],
    enabled: Boolean(circleId),
    queryFn: ({ signal }) =>
      useSampleData
        ? Promise.resolve(divisionsSample.filter((d) => d.circleId === circleId))
        : apiGet<Division[]>(`/api/v1/circles/${circleId}/divisions`, signal),
    staleTime: Infinity,
  });
}

/** DPR/<first 3 letters of division>/<year>/<4-digit sequence>, e.g. DPR/ALI/2026/0001 */
export function dprId(divisionName: string, year: number, seq: number) {
  const code = divisionName.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
  return `DPR/${code}/${year}/${String(seq).padStart(4, '0')}`;
}

async function createSample(req: NewDprRequest): Promise<CreatedDpr> {
  const route = approvalRouteFor(req.voltageClass);
  const circle = circlesSample.find((c) => c.id === req.circleId)?.name ?? req.circleId;
  const division = divisionsSample.find((d) => d.id === req.divisionId)?.name ?? req.divisionId;
  const now = new Date();
  const id = dprId(division, now.getFullYear(), sampleStore.list().length + 1);

  sampleStore.add({
    id,
    project: req.projectName.trim(),
    location: req.location.trim(),
    stream: req.projectType,
    voltage: req.voltageClass,
    capacity: req.capacity.trim(),
    circle,
    division,
    stage: 'Data Pending',
    progress: 0,
    createdAt: now.toISOString(),
  });

  return {
    ...req,
    id,
    finalApprover: route.finalApprover ?? 'To be confirmed',
    voltageGroup: route.voltageGroup,
    status: 'DATA_PENDING',
    createdAt: now.toISOString(),
  };
}

export function useCreateDpr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: NewDprRequest) => (useSampleData ? createSample(req) : apiPost<CreatedDpr>('/api/v1/dprs', req)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dprs'] }),
  });
}
