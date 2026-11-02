import { Badge } from '@/components/ui/Badge';
import { approvalRouteFor } from '@/features/initialization/routing';
import { VOLTAGE_CLASSES, type VoltageClass } from '@/features/initialization/types';
import type { DprRow } from '@/features/reports/types';

/** The selected DPR's title and the details entered when it was initialized. */
export function DprSummaryHeader({ dpr }: { dpr: DprRow }) {
  const route = (VOLTAGE_CLASSES as readonly string[]).includes(dpr.voltage) ? approvalRouteFor(dpr.voltage as VoltageClass) : null;
  const created = new Date(dpr.createdAt);
  const facts: [string, string][] = [
    ['Project type', dpr.stream],
    ['Voltage class', dpr.voltage],
    ['Capacity', dpr.capacity],
    ['Location', dpr.location],
    ['Zone', dpr.zone],
    ['Circle', dpr.circle],
    ['Division', dpr.division],
    ['Station', dpr.station || 'New site'],
    ...(route ? ([['Voltage group', route.voltageGroup], ['Final approver', route.finalApprover ?? 'Not set for this voltage yet']] as [string, string][]) : []),
    ['Initialized on', Number.isNaN(created.getTime()) ? '—' : created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
  ];
  return (
    <section aria-label="Selected DPR" className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="num text-xs text-gray-500">{dpr.id}</p>
          <h2 className="text-base font-semibold leading-snug text-gray-900">{dpr.project}</h2>
        </div>
        <Badge tone={dpr.stage === 'Data Pending' ? 'amber' : 'blue'}>{dpr.stage}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-3 lg:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="truncate text-gray-900" title={v}>
              {v || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
