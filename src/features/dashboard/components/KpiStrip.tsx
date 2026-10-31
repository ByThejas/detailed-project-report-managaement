import { formatNumber, percentOf } from '@/lib/format';
import type { DashboardSummary } from '../types';

export function KpiStrip({ counts }: { counts: DashboardSummary['counts'] }) {
  const items = [
    { label: 'Total DPRs', value: counts.total, note: 'All stages' },
    { label: 'In review', value: counts.inReview, note: 'Validation and approval' },
    { label: 'Pending dependencies', value: counts.pendingDependencies, note: 'Waiting on other teams' },
    { label: 'Generated', value: counts.generated, note: `${percentOf(counts.generated, counts.total)}% of total` },
  ];

  return (
    <section aria-label="DPR counts">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="bg-white px-4 py-3.5">
            <dt className="text-xs text-gray-500">{it.label}</dt>
            <dd className="num mt-1 text-2xl font-semibold tracking-tight text-gray-900">{formatNumber(it.value)}</dd>
            <dd className="mt-0.5 text-xs text-gray-400">{it.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
