import { STAGES, type DprRow } from '@/features/reports/types';
import type { BarItem } from '@/components/ui/BarList';
import type { DashboardSummary } from './types';

function groupCount(rows: DprRow[], key: (r: DprRow) => string): BarItem[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(key(r), (counts.get(key(r)) ?? 0) + 1));
  return [...counts].map(([label, value]) => ({ key: label, label, value }));
}

/** Builds the dashboard figures from the DPR list. The backend should return the same shape. */
export function summarise(rows: DprRow[]): DashboardSummary {
  const count = (stage: DprRow['stage']) => rows.filter((r) => r.stage === stage).length;

  const divisions = new Map<string, DashboardSummary['byDivision'][number]>();
  rows.forEach((r) => {
    const d = divisions.get(r.division) ?? { division: r.division, total: 0, inProgress: 0, generated: 0 };
    d.total += 1;
    if (r.stage === 'Generated') d.generated += 1;
    else d.inProgress += 1;
    divisions.set(r.division, d);
  });

  return {
    counts: {
      total: rows.length,
      inReview: count('Under Validation') + count('Under Approval'),
      pendingDependencies: count('Pending Dependencies'),
      generated: count('Generated'),
    },
    finance: { totalEstimated: null, sanctioned: null, workInProgress: null, balance: null },
    stages: STAGES.map((stage) => ({ stage, count: count(stage) })),
    byVoltage: groupCount(rows, (r) => r.voltage),
    byStream: groupCount(rows, (r) => r.stream),
    byDivision: [...divisions.values()],
  };
}
