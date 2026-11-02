import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { contentOf } from './content';
import { defaultPert, pertMonths, pertProblems, type PertActivity, type PertPlan } from './pert';
import { hasLineWorks } from '@/features/preparation/calc';

interface Props {
  dpr: DprRow;
  estimate: Estimate;
  onChange: (e: Estimate) => void;
}

const int = (v: string) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** Step 4: the stages of work, drawn as the PERT chart in annexure 4. */
export function PertPanel({ dpr, estimate, onChange }: Props) {
  const content = contentOf(dpr, estimate);
  const p = content.pert;
  const save = (next: PertPlan) => onChange({ ...estimate, document: { ...content, pert: next } });
  const setAct = (i: number, patch: Partial<PertActivity>) => save({ ...p, activities: p.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const problems = pertProblems(p);
  const months = pertMonths(p);

  return (
    <div className="space-y-4">
      <Card role="region" aria-labelledby="pert-title">
        <CardHeader
          id="pert-title"
          title="PERT chart"
          subtitle="Annexure 4. Months count from the zero date; pre-award work sits before M0."
          action={
            <button type="button" className="btn-ghost" onClick={() => save(defaultPert(dpr, hasLineWorks(estimate)))}>
              Reset to standard stages
            </button>
          }
        />
        <div className="grid gap-x-4 gap-y-3 border-b border-gray-200 px-4 py-3 text-[13px] sm:grid-cols-3">
          <label className="block">
            <span className="label-muted mb-1 block">Completion period (months)</span>
            <input type="number" min={1} className="input" value={p.completionMonths} onChange={(ev) => save({ ...p, completionMonths: int(ev.target.value) })} />
          </label>
          <label className="block">
            <span className="label-muted mb-1 block">Zero date</span>
            <input className="input" value={p.zeroDate} onChange={(ev) => save({ ...p, zeroDate: ev.target.value })} />
          </label>
          <label className="block">
            <span className="label-muted mb-1 block">Scope (chart heading)</span>
            <input className="input" value={p.scope} placeholder="e.g. Additional 1x20 MVA & LILO arrangement" onChange={(ev) => save({ ...p, scope: ev.target.value })} />
          </label>
        </div>
        <div className="divide-y divide-gray-100">
          {p.activities.map((a, i) => (
            <div key={i} className="grid gap-2 px-4 py-2.5 text-[13px] sm:grid-cols-[1fr_6rem_6rem_7rem_2fr_auto] sm:items-start">
              <input aria-label={`Activity ${i + 1} name`} className="input" value={a.name} onChange={(ev) => setAct(i, { name: ev.target.value })} />
              <label className="flex items-center gap-1 text-xs text-gray-500">
                From M
                <input aria-label={`${a.name} start month`} type="number" className="input w-14" value={a.start} onChange={(ev) => setAct(i, { start: int(ev.target.value) })} />
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input aria-label={`${a.name} months`} type="number" min={1} className="input w-14" value={a.months} onChange={(ev) => setAct(i, { months: int(ev.target.value) })} />
                months
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={Boolean(a.preAward)} onChange={(ev) => setAct(i, { preAward: ev.target.checked })} />
                Pre-award
              </label>
              <textarea
                aria-label={`${a.name} activities`}
                rows={Math.max(1, a.details.length)}
                className="input min-h-[2rem] py-1 text-xs"
                placeholder="One activity per line"
                value={a.details.join('\n')}
                onChange={(ev) => setAct(i, { details: ev.target.value.split('\n') })}
              />
              <button type="button" aria-label={`Remove ${a.name}`} className="btn-ghost h-8 px-1.5" onClick={() => save({ ...p, activities: p.activities.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <div className="px-4 py-2.5">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const end = Math.max(0, ...p.activities.filter((a) => !a.preAward).map((a) => a.start + a.months));
                save({ ...p, activities: [...p.activities, { name: `Stage-${p.activities.filter((a) => !a.preAward).length + 1}`, start: end, months: 1, details: [] }] });
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add stage
            </button>
          </div>
        </div>
        {problems.length > 0 && (
          <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
            Check the chart: {problems.join('; ')}.
          </p>
        )}
      </Card>

      <Card role="region" aria-labelledby="pert-preview-title">
        <CardHeader id="pert-preview-title" title="Preview" subtitle={`${p.completionMonths} months from ${p.zeroDate}`} />
        <div className="overflow-x-auto px-4 py-3">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="w-48 py-1 text-left font-medium">Timeline</th>
                {months.map((m) => (
                  <th key={m} className={`py-1 text-center font-medium ${m === 0 ? 'text-gray-900' : ''}`}>
                    M{m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.activities.map((a, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2 text-gray-800">{a.name}</td>
                  {months.map((m) => (
                    <td key={m} className="px-px py-1">
                      <div className={`h-4 rounded-sm ${m >= a.start && m < a.start + a.months ? (a.preAward ? 'bg-gray-400' : 'bg-accent-500') : 'bg-gray-50'}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
