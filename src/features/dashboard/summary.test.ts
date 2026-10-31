import { summarise } from './summary';
import type { DprRow } from '@/features/reports/types';

const row = (over: Partial<DprRow>): DprRow => ({
  id: 'x',
  project: 'p',
  location: 'l',
  stream: 'Greenfield',
  voltage: '66 kV',
  capacity: '1x16 MVA',
  circle: 'c',
  division: 'Alipura',
  stage: 'Data Pending',
  progress: 0,
  createdAt: '2026-10-31T00:00:00Z',
  ...over,
});

describe('summarise', () => {
  it('returns zeros for an empty list', () => {
    const s = summarise([]);
    expect(s.counts).toEqual({ total: 0, inReview: 0, pendingDependencies: 0, generated: 0 });
    expect(s.stages.every((x) => x.count === 0)).toBe(true);
    expect(s.byDivision).toEqual([]);
  });

  it('counts stages, groups and divisions', () => {
    const s = summarise([
      row({ stage: 'Generated' }),
      row({ stage: 'Under Approval', voltage: '110 kV' }),
      row({ division: 'Tumakuru', stream: 'Brownfield' }),
    ]);
    expect(s.counts).toEqual({ total: 3, inReview: 1, pendingDependencies: 0, generated: 1 });
    expect(s.byVoltage.find((b) => b.label === '66 kV')?.value).toBe(2);
    expect(s.byStream.find((b) => b.label === 'Brownfield')?.value).toBe(1);
    expect(s.byDivision.find((d) => d.division === 'Alipura')).toEqual({ division: 'Alipura', total: 2, inProgress: 1, generated: 1 });
  });
});
