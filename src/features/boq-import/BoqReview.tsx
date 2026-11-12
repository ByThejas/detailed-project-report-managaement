import { useMemo, useState } from 'react';
import { CheckCircle2, ListChecks, TriangleAlert, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { isMultiRate, type EstimateLine } from '@/features/preparation/types';
import { openErrors, warningsOf } from './parse';
import { planImport, sectionLabel, sectionOfItem, toEstimateLine, type ImportMode, type ImportPlan } from './toEstimateLine';
import { catalogName, useRateCatalog } from '@/features/rates/catalog';
import { applySuggestion, certainMatch, differsFromRate, type RateSuggestion } from '@/features/rates/match';
import type { BoqReadResult, ParsedItem } from './types';

const amount = (n: number) => formatNumber(Math.round(n * 100) / 100);
/** Quantity × rate, the way the estimate works it out; blank until both are known. */
const times = (qty: number | null, rate: number | null | undefined) => (qty != null && Number.isFinite(qty) && rate ? qty * rate : null);

export type { ImportMode };

interface BoqReviewProps {
  read: BoqReadResult;
  /** The estimate's lines now, for the replace warning. */
  currentLines: EstimateLine[];
  onCancel: () => void;
  onImport: (plan: ImportPlan, mode: ImportMode) => void;
}

/**
 * Shows every item read from a BOQ workbook next to its source row. Nothing reaches the estimate
 * until every included row is either clean, fixed, or explicitly confirmed.
 */
const sumOf = (items: Pick<ParsedItem, 'qty' | 'supplyRate' | 'erectionRate' | 'testingRate'>[], rate: 'supplyRate' | 'erectionRate' | 'testingRate') => items.reduce((t, i) => t + (times(i.qty, i[rate]) ?? 0), 0);

/** How a row stands against the checks and the rate catalog, for the filter. */
type RowStatus = 'fine' | 'attention' | 'unmatched';
type Filter = 'all' | RowStatus;
const FILTERS: { key: Filter; label: string; hint: string }[] = [
  { key: 'all', label: 'All rows', hint: '' },
  { key: 'fine', label: 'Fine', hint: 'Matched to a rate catalog item at the same rate, nothing to check' },
  { key: 'attention', label: 'Needs attention', hint: 'A problem to fix or confirm, or a rate that differs from the rate catalog' },
  { key: 'unmatched', label: 'Not in rate catalog', hint: 'No problem found, but no rate catalog item surely matches; the rate is the file’s' },
];

function AmountCell({ value }: { value: number | null }) {
  return <td className="num px-2 py-2 text-right font-medium text-gray-900">{value == null ? '—' : amount(value)}</td>;
}

export function BoqReview({ read, currentLines, onCancel, onImport }: BoqReviewProps) {
  const [items, setItems] = useState<ParsedItem[]>(read.items);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [sheets, setSheets] = useState<Set<string>>(() => new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name)));
  const [filter, setFilter] = useState<Filter>('all');
  const [bulkMode, setBulkMode] = useState<ImportMode>('replace');
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const [withCharges, setWithCharges] = useState(true);
  const [useSor, setUseSor] = useState(true);
  // The rate catalog kept in the Rate Catalog page is the rate source: each row's rate is set beside the SoR item it surely is.
  const { catalog, index } = useRateCatalog();
  const sorName = catalogName(catalog);

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const needsAttention = (i: ParsedItem) => openErrors(i).length > 0 || (warningsOf(i).length > 0 && !confirmed.has(i.id));
  const included = items.filter((i) => sheets.has(i.sheet) && !excluded.has(i.id));
  const blocking = included.filter(needsAttention);
  const totalsOff = read.totals.filter((t) => sheets.has(t.sheet) && Math.abs(t.stated - t.computed) > 1);
  const totalsOk = read.totals.filter((t) => sheets.has(t.sheet) && Math.abs(t.stated - t.computed) <= 1);
  const skipped = read.skipped.filter((s) => sheets.has(s.sheet) && !promoted.has(`${s.sheet}-${s.row}`));
  const tableSheets = read.sheets.filter((s) => s.headerRow);
  const sectionOfSheet = (name: string) => sectionOfItem({ sheet: name }, read);
  const parts = [...new Set([...sheets].map(sectionOfSheet))];
  const electrical = parts.some(isMultiRate);
  const part = parts.map(sectionLabel).join(', ') || sectionLabel(read.section);

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
  const sorOf = useMemo(() => {
    const out = new Map<string, RateSuggestion>();
    if (!index) return out;
    for (const i of items) {
      const m = certainMatch(index, toEstimateLine(i, read));
      if (m && m.supplyRate > 0) out.set(i.id, m);
    }
    return out;
  }, [index, items, read]);
  const sorDiffers = (i: ParsedItem) => {
    const m = sorOf.get(i.id);
    return Boolean(m && i.supplyRate > 0 && differsFromRate(m.supplyRate, toEstimateLine(i, read).supplyRate));
  };
  const differing = included.filter(sorDiffers);
  /** A row with no rate in the file (a BOQ of quantities only) that is surely an SoR item takes the SoR's rates. */
  const sorFills = (i: ParsedItem) => sorOf.has(i.id) && !(i.supplyRate > 0) && !(i.erectionRate > 0) && !(i.testingRate > 0);
  const filling = included.filter(sorFills);
  const sorApplies = (i: ParsedItem) => sorDiffers(i) || sorFills(i);
  const applying = [...differing, ...filling];
  /** The rates the row will be imported at: the file's, or the SoR's when it differs or is missing and "use SoR" is on. */
  const ratesOf = (i: ParsedItem) => {
    if (!useSor || !sorApplies(i)) return i;
    const l = applySuggestion(toEstimateLine(i, read), sorOf.get(i.id)!).line;
    return { qty: i.qty, supplyRate: l.supplyRate, erectionRate: l.erectionRate, testingRate: l.testingRate };
  };
  /** The import of these rows, at the SoR rate where it differs or is missing and "use SoR" is on. */
  const planFor = (rows: ParsedItem[]): ImportPlan => {
    const filePlan = planImport(read, rows, sheets, withCharges);
    const sorRows = useSor ? rows.filter(sorApplies) : [];
    if (!sorRows.length) return filePlan;
    // Lines remember "file · sheet row N", which ties them back to their row and its SoR item.
    const bySource = new Map(sorRows.map((i) => [`${read.fileName} · ${i.sheet} row ${i.row}`, sorOf.get(i.id)!]));
    const sorFor = (source = '') => bySource.get(source) ?? bySource.get(source.split(' · SR ')[0]!);
    return { ...filePlan, lines: filePlan.lines.map((l) => (sorFor(l.source) ? applySuggestion(l, sorFor(l.source)!).line : l)) };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planFor(included), [read, included, sheets, withCharges, useSor, sorOf]);

  /**
   * Fine: no problem, and the row is surely a rate catalog item at the file's rate (or takes the catalog's
   * rate, having none). Needs attention: a problem to fix or confirm, or a rate that differs from the catalog.
   */
  const statusOf = (i: ParsedItem): RowStatus => (needsAttention(i) || sorDiffers(i) ? 'attention' : sorOf.has(i.id) ? 'fine' : 'unmatched');
  const inSheets = items.filter((i) => sheets.has(i.sheet));
  const counts: Record<Filter, number> = { all: inSheets.length, fine: 0, attention: 0, unmatched: 0 };
  for (const i of inSheets) counts[statusOf(i)] += 1;
  const shown = filter === 'all' ? inSheets : inSheets.filter((i) => statusOf(i) === filter);
  // Bulk imports: every row that can be imported (warnings taken as checked), or only the rows that match the catalog.
  const withErrors = included.filter((i) => openErrors(i).length > 0);
  const allRows = included.filter((i) => openErrors(i).length === 0);
  const matchedRows = included.filter((i) => statusOf(i) === 'fine');
  const bulk = (rows: ParsedItem[]) => onImport(planFor(rows), currentCount ? bulkMode : 'replace');
  const lines = plan.lines;
  const currentCount = currentLines.filter((l) => plan.sections.includes(l.section)).length;

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
                    → {sectionLabel(sectionOfSheet(s.name))} · header row {s.headerRow}
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
        {plan.warnings.map((w) => (
          <p key={w} role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{w}</span>
          </p>
        ))}
        {plan.notes.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="font-medium text-gray-900">Also carried over from the file</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-gray-700">
              {plan.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            {(read.abstracts ?? []).length > 0 && (
              <label className="mt-1.5 flex items-center gap-1.5 text-gray-700">
                <input type="checkbox" checked={withCharges} onChange={(e) => setWithCharges(e.target.checked)} />
                Use the area loading, GST, statutory charges and compensation from the file’s abstract sheets
              </label>
            )}
          </div>
        )}
        {filling.length > 0 && differing.length === 0 && (
          <div role="status" aria-label="Rows priced from the SoR" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            <p className="font-medium">
              {filling.length} {filling.length === 1 ? 'row has' : 'rows have'} no rate in the file and {filling.length === 1 ? 'is' : 'are'} surely an SoR item ({sorName}).
            </p>
            <label className="mt-1.5 flex items-center gap-1.5">
              <input type="checkbox" checked={useSor} onChange={(e) => setUseSor(e.target.checked)} />
              Import {filling.length === 1 ? 'it' : 'them'} at the SoR rate (supply, and erection/T&amp;C where the SoR has them per {filling.length === 1 ? 'its' : 'their'} unit). Price the other rows with “Price from the rate catalog” after importing.
            </label>
          </div>
        )}
        {differing.length > 0 && (
          <div role="status" aria-label="Rates that differ from the SoR" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
            {filling.length > 0 && (
              <p className="mb-1">
                {filling.length} {filling.length === 1 ? 'row has' : 'rows have'} no rate in the file and will take the SoR rate too.
              </p>
            )}
            <p className="font-medium">
              {differing.length} {differing.length === 1 ? 'supply rate in the file differs' : 'supply rates in the file differ'} from the SoR ({sorName}):
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {differing.slice(0, 6).map((i) => (
                <li key={i.id}>
                  {i.sheet} row {i.row}: file Rs {amount(i.supplyRate)}, SoR {sorOf.get(i.id)!.item.code} Rs {amount(sorOf.get(i.id)!.supplyRate)}
                </li>
              ))}
              {differing.length > 6 && <li>…and {differing.length - 6} more.</li>}
            </ul>
            <label className="mt-1.5 flex items-center gap-1.5">
              <input type="checkbox" checked={useSor} onChange={(e) => setUseSor(e.target.checked)} />
              Import {differing.length === 1 ? 'it' : 'them'} at the SoR rate (supply, and erection/T&amp;C where the SoR has them per {differing.length === 1 ? 'its' : 'their'} unit)
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show rows">
          <span className="label-muted mr-1">Show</span>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              title={f.hint || undefined}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                filter === f.key ? 'border-accent-500 bg-accent-500 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {f.key === 'fine' && <span className={`h-2 w-2 rounded-full ${filter === f.key ? 'bg-white' : 'bg-emerald-500'}`} aria-hidden />}
              {f.key === 'attention' && <span className={`h-2 w-2 rounded-full ${filter === f.key ? 'bg-white' : 'bg-amber-500'}`} aria-hidden />}
              {f.key === 'unmatched' && <span className={`h-2 w-2 rounded-full ${filter === f.key ? 'bg-white' : 'bg-gray-400'}`} aria-hidden />}
              {f.label}
              <span className="num opacity-80">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div role="group" aria-label="Quick import" className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="flex items-center gap-1.5 font-medium text-gray-900">
            <ListChecks className="h-4 w-4 text-gray-500" aria-hidden />
            Quick import, without checking rows one by one
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" disabled={allRows.length === 0} onClick={() => bulk(allRows)}>
              Import all {allRows.length} rows
            </button>
            <button type="button" className="btn-secondary" disabled={matchedRows.length === 0} onClick={() => bulk(matchedRows)}>
              Import only the {matchedRows.length} rows matching the rate catalog
            </button>
            {currentCount > 0 && (
              <select aria-label="Quick import into the estimate" value={bulkMode} onChange={(e) => setBulkMode(e.target.value as ImportMode)} className="input h-8 w-auto text-[13px]">
                <option value="replace">
                  Replacing the {currentCount} current items in {part}
                </option>
                <option value="append">Added to the current items</option>
              </select>
            )}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            “Import all” takes every row with a quantity and description, with its warnings taken as checked
            {withErrors.length > 0 ? `; ${withErrors.length} ${withErrors.length === 1 ? 'row' : 'rows'} with no quantity or description ${withErrors.length === 1 ? 'is' : 'are'} left out` : ''}. “Matching the rate catalog” takes only the rows shown as Fine: surely a {sorName} item at the same rate, or with no rate in the file and priced from it.
            {useSor && applying.length > 0 ? ` Rows whose rate differs from ${sorName} come in at its rate.` : ''}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto relative">
        <table className={`w-full text-[13px] ${electrical ? 'min-w-[1480px]' : 'min-w-[1000px]'}`}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th scope="col" className={`${th} w-28 pl-4`}>Source</th>
              <th scope="col" className={`${th} w-12 text-center`}>Skip</th>
              <th scope="col" className={`${th} w-16`}>Sl. no.</th>
              <th scope="col" className={th}>Description</th>
              <th scope="col" className={`${th} w-20`}>Unit</th>
              <th scope="col" className={`${th} w-24 text-right`}>Qty</th>
              <th scope="col" className={`${th} w-28 text-right`}>{electrical ? 'Supply rate' : 'Rate'}</th>
              <th scope="col" className={`${th} w-32 text-right text-gray-700`}>{electrical ? 'Supply amount' : 'Amount'}</th>
              {electrical && (
                <>
                  <th scope="col" className={`${th} w-24 text-right`}>Erection rate</th>
                  <th scope="col" className={`${th} w-28 text-right text-gray-700`}>Erection amount</th>
                  <th scope="col" className={`${th} w-24 text-right`}>T&amp;C rate</th>
                  <th scope="col" className={`${th} w-28 text-right text-gray-700`}>T&amp;C amount</th>
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
                    {i.srRef && (
                      <>
                        <br />
                        SR {i.srRef}
                      </>
                    )}
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
                  <td className="num px-2 py-2 text-right text-gray-700">
                    {i.supplyRate ? amount(i.supplyRate) : '—'}
                    {sorOf.has(i.id) && (
                      <span className={`block text-xs ${sorDiffers(i) ? 'font-medium text-rose-700' : 'text-emerald-700'}`}>
                        SoR {sorOf.get(i.id)!.item.code}: {amount(sorOf.get(i.id)!.supplyRate)}
                      </span>
                    )}
                  </td>
                  <AmountCell value={times(i.qty, ratesOf(i).supplyRate)} />
                  {electrical && (
                    <>
                      <td className="num px-2 py-2 text-right text-gray-700">{i.erectionRate ? amount(i.erectionRate) : '—'}</td>
                      <AmountCell value={times(i.qty, ratesOf(i).erectionRate)} />
                      <td className="num px-2 py-2 text-right text-gray-700">{i.testingRate ? amount(i.testingRate) : '—'}</td>
                      <AmountCell value={times(i.qty, ratesOf(i).testingRate)} />
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
                    {errors.length === 0 && warnings.length === 0 && (sorOf.has(i.id) ? <span className="text-emerald-700">{sorDiffers(i) ? 'OK, but the rate differs from the rate catalog' : 'Fine: matches the rate catalog'}</span> : <span className="text-gray-500">OK, not in the rate catalog</span>)}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={electrical ? 13 : 9} className="px-4 py-6 text-center text-gray-500">
                  {{ all: 'No items in the selected sheets.', fine: 'No rows match the rate catalog without a check.', attention: 'No rows need attention.', unmatched: 'Every row matches the rate catalog or needs attention.' }[filter]}
                </td>
              </tr>
            )}
          </tbody>
          {included.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-900">
              <tr>
                <td colSpan={7} className="py-2 pl-4 pr-2 text-right">
                  Total of the {included.length} rows to import
                </td>
                <td className="num px-2 py-2 text-right">{amount(sumOf(included.map(ratesOf), 'supplyRate'))}</td>
                {electrical && (
                  <>
                    <td />
                    <td className="num px-2 py-2 text-right">{amount(sumOf(included.map(ratesOf), 'erectionRate'))}</td>
                    <td />
                    <td className="num px-2 py-2 text-right">{amount(sumOf(included.map(ratesOf), 'testingRate'))}</td>
                  </>
                )}
                <td />
              </tr>
            </tfoot>
          )}
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
        <button type="button" className="btn-primary" disabled={blocking.length > 0 || lines.length === 0} onClick={() => onImport(plan, 'replace')}>
          Import {lines.length} items{currentCount ? `, replacing the ${currentCount} in ${part}` : ` into ${part}`}
        </button>
        {currentCount > 0 && (
          <button type="button" className="btn-secondary" disabled={blocking.length > 0 || lines.length === 0} onClick={() => onImport(plan, 'append')}>
            Add to the current items
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <span role="status" className={blocking.length ? 'text-amber-800' : 'text-gray-500'}>
          {blocking.length ? `${blocking.length} ${blocking.length === 1 ? 'row needs' : 'rows need'} attention: fix, confirm or skip ${blocking.length === 1 ? 'it' : 'them'} to import.` : 'Every row is checked.'}{' '}
          These rows reach the estimate and the Excel download only after you import them.
        </span>
      </div>
    </Card>
  );
}
