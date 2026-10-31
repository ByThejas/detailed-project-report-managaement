import type { DprRow } from '@/features/reports/types';
import { sampleStore } from '@/lib/sampleStore';

export const row = (over: Partial<DprRow> = {}): DprRow => ({
  id: 'DPR/ALI/2026/0001',
  project: '110/11kV Channapatna New S/S',
  location: 'Channapatna',
  stream: 'Greenfield',
  voltage: '110 kV',
  capacity: '1x16 MVA',
  circle: 'Bengaluru Circle',
  division: 'Alipura',
  stage: 'Data Pending',
  progress: 0,
  createdAt: '2026-10-31T09:00:00.000Z',
  ...over,
});

/** Puts DPRs in the sample store before the app renders. */
export function seed(rows: DprRow[]) {
  [...rows].reverse().forEach((r) => sampleStore.add(r));
}
