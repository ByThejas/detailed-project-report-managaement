import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import type { DashboardSummary } from '../types';

export function BudgetCard({ finance }: { finance: DashboardSummary['finance'] }) {
  const items = [
    { label: 'Total estimated', value: finance.totalEstimated },
    { label: 'Sanctioned', value: finance.sanctioned },
    { label: 'Work in progress', value: finance.workInProgress },
    { label: 'Balance', value: finance.balance },
  ];
  const empty = items.every((i) => i.value === null);

  return (
    <Card role="region" aria-labelledby="budget-title">
      <CardHeader id="budget-title" title="Budget" subtitle="Rs. lakhs" />
      <dl className="divide-y divide-gray-100 px-4">
        {items.map((it) => (
          <div key={it.label} className="flex items-baseline justify-between py-2.5 text-[13px]">
            <dt className="text-gray-500">{it.label}</dt>
            <dd className="num font-medium text-gray-900">{formatNumber(it.value)}</dd>
          </div>
        ))}
      </dl>
      {empty && <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400">Figures appear once cost estimates are added.</p>}
    </Card>
  );
}
