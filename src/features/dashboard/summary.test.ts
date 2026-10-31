import { summarise } from './summary';
import { row } from '@/test/fixtures';

describe('summarise', () => {
  it('returns zeros for an empty list', () => {
    const s = summarise([]);
    expect(s.counts).toEqual({ total: 0, inReview: 0, pendingDependencies: 0, generated: 0 });
    expect(s.stages.every((x) => x.count === 0)).toBe(true);
    expect(s.byDivision).toEqual([]);
  });

  it('counts stages, groups and divisions', () => {
    const s = summarise([
      row({ stage: 'Generated', voltage: '66 kV' }),
      row({ stage: 'Under Approval', voltage: '110 kV' }),
      row({ division: 'TUMKUR', stream: 'Brownfield', voltage: '66 kV' }),
    ]);
    expect(s.counts).toEqual({ total: 3, inReview: 1, pendingDependencies: 0, generated: 1 });
    expect(s.byVoltage.find((b) => b.label === '66 kV')?.value).toBe(2);
    expect(s.byStream.find((b) => b.label === 'Brownfield')?.value).toBe(1);
    expect(s.byDivision.find((d) => d.division === 'PEENYA')).toEqual({ division: 'PEENYA', total: 2, inProgress: 1, generated: 1 });
  });
});
