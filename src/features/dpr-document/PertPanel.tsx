import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { contentOf, isLineOnly } from './content';
import { criticalPath, defaultPert, PERT_PRESETS, pertMilestones, pertMonths, pertProblems, planFromPreset, stageName, type PertActivity, type PertKind, type PertPlan } from './pert';
import { hasLineWorks } from '@/features/preparation/calc';

interface Props {
  dpr: DprRow;
  estimate: Estimate;
  onChange: (e: Estimate) => void;
}

const int = (v: string) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** Step 4: the stages of work, drawn as the PERT chart in annexure 4, laid out like the KPTCL PERT chart generator. */
export function PertPanel({ dpr, estimate, onChange }: Props) {
  const content = contentOf(dpr, estimate);
  const p = content.pert;
  const save = (next: PertPlan) => onChange({ ...estimate, document: { ...content, pert: next } });
  const setAct = (i: number, patch: Partial<PertActivity>) => save({ ...p, activities: p.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const problems = pertProblems(p);
  const months = pertMonths(p);
  const milestones = pertMilestones(p);
  const applyPreset = (v: string) => {
    if (v === 'standard') save(defaultPert(dpr, hasLineWorks(estimate), isLineOnly(estimate)));
    else if (PERT_PRESETS[Number(v)]) save(planFromPreset(PERT_PRESETS[Number(v)]!, p.scope, p.zeroDate));
  };

  return (
    <div className="space-y-4">
      <Card role="region" aria-labelledby="pert-title">
        <CardHeader
          id="pert-title"
          title="PERT chart"
          subtitle="Annexure 4. Months count from the zero date; pre-award work sits before M0."
          action={
            <select aria-label="Start from a standard schedule" className="input w-auto" value="" onChange={(ev) => applyPreset(ev.target.value)}>
              <option value="" disabled>
                Start from a standard schedule…
              </option>
              <option value="standard">Standard for this DPR</option>
              {PERT_PRESETS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          }
        />
        <div className="grid gap-x-4 gap-y-3 border-b border-gray-200 px-4 py-3 text-[13px] sm:grid-cols-4">
          <label className="block">
            <span className="label-muted mb-1 block">Type of work</span>
            <select className="input" value={p.kind ?? 'Sub-station work'} onChange={(ev) => save({ ...p, kind: ev.target.value as PertKind })}>
              <option>Sub-station work</option>
              <option>Transmission line work</option>
            </select>
          </label>
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
          <label className="block sm:col-span-2">
            <span className="label-muted mb-1 block">Completion period basis</span>
            <textarea rows={2} className="input py-1" value={p.caseText ?? ''} placeholder="e.g. Augmentation — 6 months from the date of LOI / Award, or one month from the date of supply of the transformer, whichever is later." onChange={(ev) => save({ ...p, caseText: ev.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label-muted mb-1 block">Note under the chart</span>
            <textarea rows={2} className="input py-1" value={p.note ?? ''} onChange={(ev) => save({ ...p, note: ev.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={Boolean(p.provisional)} onChange={(ev) => save({ ...p, provisional: ev.target.checked })} />
            Provisional schedule
          </label>
        </div>
        <div className="divide-y divide-gray-100">
          {p.activities.map((a, i) => (
            <div key={i} className="grid gap-2 px-4 py-2.5 text-[13px] sm:grid-cols-[8rem_2fr_auto_auto_auto_auto] sm:items-start">
              <input aria-label={`Activity ${i + 1} name`} className="input" value={a.name} onChange={(ev) => setAct(i, { name: ev.target.value })} />
              <input aria-label={`${a.name} description`} className="input" placeholder={a.preAward ? '' : 'What the stage covers'} value={a.label ?? ''} onChange={(ev) => setAct(i, { label: ev.target.value })} />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500">
                From M
                <input aria-label={`${a.name} start month`} type="number" className="input w-14" value={a.start} onChange={(ev) => setAct(i, { start: int(ev.target.value) })} />
              </label>
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500">
                <input aria-label={`${a.name} months`} type="number" min={1} className="input w-14" value={a.months} onChange={(ev) => setAct(i, { months: int(ev.target.value) })} />
                months
              </label>
              <label className="flex h-8 items-center gap-1.5 whitespace-nowrap text-xs text-gray-600">
                <input type="checkbox" checked={Boolean(a.preAward)} onChange={(ev) => setAct(i, { preAward: ev.target.checked })} />
                Pre-award
              </label>
              <button type="button" aria-label={`Remove ${a.name}`} className="btn-ghost h-8 px-1.5" onClick={() => save({ ...p, activities: p.activities.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
              {!a.preAward && (
                <>
                  <span className="hidden sm:block" />
                  <textarea
                    aria-label={`${a.name} activities`}
                    rows={Math.max(1, a.details.length)}
                    className="input min-h-[2rem] py-1 text-xs"
                    placeholder="One activity per line"
                    value={a.details.join('\n')}
                    onChange={(ev) => setAct(i, { details: ev.target.value.split('\n') })}
                  />
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500 sm:col-span-4">
                    Milestone
                    <input aria-label={`${a.name} milestone`} className="input" placeholder="e.g. Foundation ready" value={a.milestone ?? ''} onChange={(ev) => setAct(i, { milestone: ev.target.value })} />
                  </label>
                </>
              )}
            </div>
          ))}
          <div className="px-4 py-2.5">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const work = p.activities.filter((a) => !a.preAward);
                const end = Math.max(0, ...work.map((a) => a.start + a.months));
                save({ ...p, activities: [...p.activities, { name: stageName(work.length), label: '', start: end, months: 1, details: [], milestone: '' }] });
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
        <CardHeader id="pert-preview-title" title={`Preview${p.provisional ? ' · provisional schedule' : ''}`} subtitle={`${p.kind ?? 'Sub-station work'} · ${p.completionMonths} months from ${p.zeroDate}`} />
        {p.caseText && <p className="border-b border-gray-100 px-4 py-2 text-[13px] text-gray-700">{p.caseText}</p>}
        <div className="overflow-x-auto px-4 py-3 relative">
          <table className="w-full min-w-[640px] table-fixed text-xs">
            <colgroup>
              <col className="w-56" />
              {months.map((m) => (
                <col key={m} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-gray-500">
                <th className="py-1 text-left font-medium">Timeline</th>
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
                  <td className="py-1 pr-2 text-gray-800">
                    <span className="font-medium">{a.name}</span>
                    {a.label && <span className="block text-[11px] leading-snug text-gray-500">{a.label}</span>}
                  </td>
                  {months.map((m) => (
                    <td key={m} className="px-px py-1">
                      <div className={`h-4 rounded-sm ${m >= a.start && m < a.start + a.months ? (a.preAward ? 'bg-gray-400' : 'bg-accent-500') : 'bg-gray-50'}`} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr aria-label="Milestones">
                <td className="py-1 pr-2 font-medium text-gray-800">Milestones</td>
                {months.map((m) => {
                  // A milestone at the end of month m-1 is drawn at the start of column m; one at the completion month goes in the last column.
                  const here = milestones.filter((x) => x.month === m || (x.month === months.at(-1)! + 1 && m === months.at(-1)));
                  return (
                    <td key={m} className="break-words px-px py-1 text-center align-top text-[10px] leading-tight text-gray-600">
                      {here.map((x) => (
                        <span key={x.label} className="block">
                          ◆ {x.label}
                        </span>
                      ))}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-600">Critical path: {criticalPath(p)}</p>
        {p.note && <p className="border-t border-gray-100 px-4 py-2 text-xs italic text-gray-600">{p.note}</p>}
      </Card>
    </div>
  );
}
