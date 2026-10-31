import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber, percentOf } from '@/lib/format';
import { stageBar } from '@/features/reports/stage';
import type { StageCount } from '../types';

/** Where every DPR sits in its lifecycle. Each stage links to the matching reports view. */
export function PipelineCard({ stages }: { stages: StageCount[] }) {
  const total = stages.reduce((s, x) => s + x.count, 0);

  return (
    <Card role="region" aria-labelledby="pipeline-title">
      <CardHeader id="pipeline-title" title="Pipeline" subtitle="DPRs by lifecycle stage" />
      <div className="px-4 py-4">
        <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-gray-100" aria-hidden>
          {stages
            .filter((s) => s.count > 0)
            .map((s) => (
              <div key={s.stage} className={stageBar[s.stage]} style={{ width: `${(s.count / total) * 100}%` }} />
            ))}
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
          {stages.map((s) => (
            <li key={s.stage}>
              <Link to={`/reports?stage=${encodeURIComponent(s.stage)}`} className="group block rounded-sm">
                <span className="flex items-center gap-1.5 text-xs text-gray-500 group-hover:text-gray-900">
                  <span className={`h-1.5 w-1.5 rounded-full ${stageBar[s.stage]}`} aria-hidden />
                  {s.stage}
                </span>
                <span className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="num text-base font-semibold text-gray-900">{formatNumber(s.count)}</span>
                  <span className="num text-xs text-gray-400">{percentOf(s.count, total)}%</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
