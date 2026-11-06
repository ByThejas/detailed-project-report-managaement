import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, useSampleData } from '@/lib/apiClient';
import { sampleStore } from '@/lib/sampleStore';
import { getCircle, getDivision, getZone } from '@/features/locations/lookup';
import { approvalRouteFor } from './routing';
import type { CreatedDpr, NewDprRequest } from './types';

/** DPR/<first 3 letters of division>/<year>/<4-digit sequence>, e.g. DPR/ALI/2026/0001 */
export function dprId(divisionName: string, year: number, seq: number) {
  const code = divisionName.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
  return `DPR/${code}/${year}/${String(seq).padStart(4, '0')}`;
}

async function createSample(req: NewDprRequest): Promise<CreatedDpr> {
  const route = approvalRouteFor(req.voltageClass);
  const zone = getZone(req.zoneId)?.name ?? req.zoneId;
  const circle = getCircle(req.circleId)?.name ?? req.circleId;
  const division = getDivision(req.divisionId)?.name ?? req.divisionId;
  let station = '';
  if (req.stationCode) {
    const { stations } = await import('@/data/stations');
    station = stations.find((s) => s[0] === req.stationCode)?.[1] ?? '';
  }
  const now = new Date();
  const id = dprId(division, now.getFullYear(), sampleStore.list().length + 1);

  sampleStore.add({
    id,
    project: req.projectName.trim(),
    location: req.location.trim(),
    stream: req.projectType,
    workType: req.workType,
    voltage: req.voltageClass,
    capacity: req.capacity.trim(),
    zone,
    circle,
    division,
    station,
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
