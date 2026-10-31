import { useMemo, useState } from 'react';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import type { EstimateLine } from '@/features/preparation/types';
import { openErrors, warningsOf } from './parse';
import { toEstimateLine } from './toEstimateLine';
import type { BoqReadResult, ParsedItem } from './types';

const PART = { electrical: 'Part A', civil: 'Part B', dismantling: 'Dismantling' } as const;
const amount = (n: number) => formatNumber(Math.round(n * 100) / 100);

export type ImportMode = 'replace' | 'append';

interface BoqReviewProps {
  read: BoqReadResult;
  /** How many lines the BOQ part has now, for the replace warning. */
  currentCount: number;
  onCancel: () => void;
  onImport: (lines: EstimateLine[], mode: ImportMode) => void;
}

/**
 * Shows every item read from a BOQ workbook next to its source row. Nothing reaches the estimate
 * until every included row is either clean, fixed, or explicitly confirmed.
 */
export function BoqReview({ read, currentCount, onCancel, onImport }: BoqReviewProps) {
  const [items, setItems] = useState<ParsedItem[]>(read.items);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [sheets, setSheets] = useState<Set<string>>(() => new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name)));
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [promoted, setPromoted] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const needsAttention = (i: ParsedItem) => openErrors(i).length > 0 || (warningsOf(i).length > 0 && !confirmed.has(i.id));
  const included = items.filter((i) => sheets.has(i.sheet) && !excluded.has(i.id));
  const blocking = included.filter(needsAttention);
  const shown = (onlyAttention ? items.filter(needsAttention) : items).filter((i) => sheets.has(i.sheet));
  const totalsOff = read.totals.filter((t) => sheets.has(t.sheet) && Math.abs(t.stated - t.computed) > 1);
  const totalsOk = read.totals.filter((t) => sheets.has(t.sheet) && Math.abs(t.stated - t.computed) <= 1);
  const skipped = read.skipped.filter((s) => sheets.has(s.sheet) && !promoted.has(`${s.sheet}-${s.row}`));
  const tableSheets = read.sheets.filter((s) => s.headerRow);
  const electrical = read.section === 'electrical';
  const part = PART[read.section];

  const edit = (id: string, change: Partial<ParsedItem>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const promote = (s: (typeof read.skipped)[number]) => {
    setPromoted((p) => toggle(p, `${s.sheet}-${s.row}`, true));
    setItems((all) =>
      [
        ...all,
        {
          id: `promoted-${s.sheet}-${s.row}`,
          sheet: s.sheet,
          row: s.row,
          code: s.code,
          description: s.description,
          unit: '',
          qty: null,
          supplyRate: 0,
          erectionRate: 0,
          testingRate: 0,
          issues: [{ level: 'error' as const, field: 'qty' as const, message: 'No quantity in the file. Enter it from the drawing or BOQ' }],
        },
      ].sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : 0)),
    );
  };
  const lines = useMemo(() => included.map((i) => toEstimateLine(i, read)), [included, read]);

  const th = 'px-2 py-2 font-medium';
  return (
    <Card role="region" aria-labelledby="boq-review-title" className="border-accent-500/40">
      <CardHeader
        id="boq-review-title"
        title={`Review BOQ import: ${read.fileName}`}
        subtitle={`${items.filter((i) => sheets.has(i.sheet)).length} items read for ${part} from the selected sheets. Nothing changes in the estimate until you import.`}
        action={
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Close review">
            <X className="h-4 w-4" aria-hidden />
          </button>
        }
      />

      <div className="space-y-3 border-b border-gray-200 px-4 py-3 text-[13px]">
        {tableSheets.length > 0 && (
          <fieldset>
            <legend className="label-muted mb-1.5">Sheets to import</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {tableSheets.map((s) => (
                <label key={s.name} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={sheets.has(s.name)} onChange={(e) => setSheets((set) => toggle(set, s.name, e.target.checked))} />
                  <span className="text-gray-900">{s.name}</span>
                  <span className="text-xs text-gray-500">
                    header row {s.headerRow}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {read.sheets
          .filter((s) => !s.headerRow)
          .map((s) => (
            <p key={s.name} className="text-xs text-gray-500">
              {s.name}: {s.note}
            </p>
          ))}
        {totalsOff.map((t) => (
          <p key={`${t.sheet}-${t.row}-${t.column}`} role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {t.sheet} row {t.row} “{t.label}” states {t.column} Rs {amount(t.stated)}, but the items above it add up to Rs {amount(t.computed)} (difference Rs{' '}
              {amount(t.stated - t.computed)}). Check for missing or misread rows before importing.
            </span>
          </p>
        ))}
        {totalsOk.length > 0 && (
          <p className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {totalsOff.length > 0
              ? `The other ${totalsOk.length === 1 ? 'total matches' : `${totalsOk.length} totals match`}`
              : totalsOk.length === 1
                ? 'The total in the file matches'
                : `All ${totalsOk.length} totals in the file match`}{' '}
            the items read.
          </p>
        )}
        <label className="flex items-center gap-1.5 text-gray-700">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
          Show only rows that need attention
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className={`w-full text-[13px] ${electrical ? 'min-w-[1120px]' : 'min-w-[880px]'}`}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th scope="col" className={`${th} w-28 pl-4`}>Source</th>
              <th scope="col" className={`${th} w-12 text-center`}>Skip</th>
              <th scope="col" className={`${th} w-16`}>Sl. no.</th>
              <th scope="col" className={th}>Description</th>
              <th scope="col" className={`${th} w-20`}>Unit</th>
              <th scope="col" className={`${th} w-24 text-right`}>Qty</th>
              <th scope="col" className={`${th} w-28 text-right`}>{electrical ? 'Supply rate' : 'Rate'}</th>
              {electrical && (
                <>
                  <th scope="col" className={`${th} w-24 text-right`}>Erection rate</th>
                  <th scope="col" className={`${th} w-24 text-right`}>T&amp;C rate</th>
                </>
              )}
              <th scope="col" className={`${th} w-64 pr-4`}>Check</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const errors = openErrors(i);
              const warnings = warningsOf(i);
              const off = excluded.has(i.id);
              const tone = off ? 'opacity-50' : errors.length ? 'bg-rose-50/60' : warnings.length && !confirmed.has(i.id) ? 'bg-amber-50/60' : '';
              return (
                <tr key={i.id} className={`border-b border-gray-100 align-top ${tone}`}>
                  <td className="num py-2 pl-4 pr-2 text-xs text-gray-500">
                    {i.sheet}
                    <br />
                    row {i.row}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" aria-label={`Skip row ${i.row}`} checked={off} onChange={(e) => setExcluded((x) => toggle(x, i.id, e.target.checked))} />
                  </td>
                  <td className="px-2 py-2 text-gray-700">{i.code}</td>
                  <td className="px-2 py-2 text-gray-900">
                    {i.heading && <span className="block text-xs text-gray-500">Under: {i.heading}</span>}
                    {i.description || <span className="text-rose-700">(no description)</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input aria-label={`Unit, row ${i.row}`} value={i.unit} onChange={(e) => edit(i.id, { unit: e.target.value })} className="input h-7 px-1.5 text-[13px]" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Quantity, row ${i.row}`}
                      aria-invalid={errors.some((e) => e.field === 'qty')}
                      value={i.qty ?? ''}
                      onChange={(e) => edit(i.id, { qty: e.target.value === '' ? null : e.target.valueAsNumber })}
                      className="input num h-7 px-1.5 text-right text-[13px]"
                    />
                  </td>
                  <td className="num px-2 py-2 text-right text-gray-700">{i.supplyRate ? amount(i.supplyRate) : '—'}</td>
                  {electrical && (
                    <>
                      <td className="num px-2 py-2 text-right text-gray-700">{i.erectionRate ? amount(i.erectionRate) : '—'}</td>
                      <td className="num px-2 py-2 text-right text-gray-700">{i.testingRate ? amount(i.testingRate) : '—'}</td>
                    </>
                  )}
                  <td className="px-2 py-2 pr-4 text-xs">
                    {errors.map((e) => (
                      <p key={e.message} className="text-rose-700">
                        {e.message}
                      </p>
                    ))}
                    {warnings.map((w) => (
                      <p key={w.message} className="text-amber-800">
                        {w.message}
                      </p>
                    ))}
                    {warnings.length > 0 && errors.length === 0 && (
                      <label className="mt-1 flex items-center gap-1.5 text-gray-700">
                        <input type="checkbox" checked={confirmed.has(i.id)} onChange={(e) => setConfirmed((c) => toggle(c, i.id, e.target.checked))} />
                        Checked, it’s right
                      </label>
                    )}
                    {errors.length === 0 && warnings.length === 0 && <span className="text-emerald-700">OK</span>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={electrical ? 10 : 8} className="px-4 py-6 text-center text-gray-500">
                  {onlyAttention ? 'No rows need attention.' : 'No items in the selected sheets.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {skipped.length > 0 && (
        <details className="border-t border-gray-200 px-4 py-3 text-[13px]">
          <summary className="cursor-pointer text-gray-700">{skipped.length} rows were not read as items (headings, notes, totals). Check none of them is a real item.</summary>
          <ul className="mt-2 divide-y divide-gray-100">
            {skipped.map((s) => (
              <li key={`${s.sheet}-${s.row}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="num w-28 text-xs text-gray-500">
                  {s.sheet} row {s.row}
                </span>
                <span className="min-w-0 flex-1 text-gray-900">
                  {s.code && <span className="mr-1.5 text-gray-500">{s.code}</span>}
                  {s.description}
                </span>
                <span className="text-xs text-gray-500">{s.reason}</span>
                {s.canInclude && (
                  <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => promote(s)}>
                    Add as item
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-4 py-3 text-[13px]">
        <button type="button" className="btn-primary" disabled={blocking.length > 0 || lines.length === 0} onClick={() => onImport(lines, 'replace')}>
          Import {lines.length} items{currentCount ? `, replacing the ${currentCount} in ${part}` : ` into ${part}`}
        </button>
        {currentCount > 0 && (
          <button type="button" className="btn-secondary" disabled={blocking.length > 0 || lines.length === 0} onClick={() => onImport(lines, 'append')}>
            Add to the current items
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <span role="status" className={blocking.length ? 'text-amber-800' : 'text-gray-500'}>
          {blocking.length ? `${blocking.length} ${blocking.length === 1 ? 'row needs' : 'rows need'} attention: fix, confirm or skip ${blocking.length === 1 ? 'it' : 'them'}.` : 'Every row is checked.'}
        </span>
      </div>
    </Card>
  );
}
