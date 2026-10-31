import { Card, CardHeader } from '@/components/ui/Card';
import type { ProgrammeReport } from './types';

export function ProgrammeReportsCard({ reports }: { reports: ProgrammeReport[] }) {
  return (
    <Card role="region" aria-labelledby="programme-title">
      <CardHeader id="programme-title" title="Programme reporting" subtitle="Scheduled reports and how often they run" />
      <ul className="divide-y divide-gray-100">
        {reports.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <span className="text-gray-900">{r.name}</span>
            <span className="text-xs text-gray-500">{r.frequency}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
