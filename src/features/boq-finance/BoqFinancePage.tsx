import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FlaskConical, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatNumber } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { blobBytes } from '@/lib/fileStore';
import { BoqReview } from '@/features/boq-import/BoqReview';
import { openErrors, warningsOf } from '@/features/boq-import/parse';
import { readBoqWorkbook } from '@/features/boq-import/readWorkbook';
import { applyImport, sectionLabel, type ImportMode, type ImportPlan } from '@/features/boq-import/toEstimateLine';
import type { BoqReadResult } from '@/features/boq-import/types';
import { RatePricingCard } from '@/features/rates/RatePricingCard';
import { abstractChecks, estimateChecks, type CrossCheck } from '@/features/dpr-document/crossChecks';
import { BoqTable } from '@/features/preparation/BoqTable';
import { CostBenefitCard } from '@/features/preparation/CostBenefitCard';
import { AbstractCard, GeneralAbstractCard } from '@/features/preparation/DprPreparationPage';
import { abstractOf, generalAbstract, hasLineWorks, linesMissingRates, type AbstractPart } from '@/features/preparation/calc';
import { DEFAULT_FINANCIALS, hasBcrInputs, isBcrExempt, summariseFinancials } from '@/features/preparation/finance';
import { exportEstimate } from '@/features/preparation/exportEstimate';
import { buildTemplate } from '@/features/preparation/template';
import type { Estimate, EstimateSection } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';

/**
 * Temporary test bench for the BOQ reader, the estimate and the BCR. One workbook is uploaded on its own,
 * reviewed, imported and checked against its own totals, then uploaded again after a fix, as often as
 * needed. It is not tied to any DPR: nothing here changes a real DPR's estimate. The bench keeps its
 * state in this browser only.
 */

const STORE_KEY = 'dpr.boqTestBench.v1';
const lakhs = (n: number) => formatNumber(Math.round(n * 100) / 100);
const fmt = (n: number) => String(Math.round(n * 100) / 100);

interface Bench {
  estimate: Estimate;
  read: BoqReadResult | null;
  /** e.g. "1x20 MVA", to suggest the BCR's added MVA. */
  capacity: string;
  /** Part a sheet goes to when its name doesn't say. */
  section: EstimateSection;
  importedAt?: string;
}

const emptyEstimate = (): Estimate => buildTemplate({ capacity: '', voltage: '', stream: 'Greenfield' });
const freshBench = (): Bench => ({ estimate: emptyEstimate(), read: null, capacity: '', section: 'electrical' });

function loadBench(): Bench {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...freshBench(), ...(JSON.parse(raw) as Bench) };
  } catch {
    /* no storage: start fresh */
  }
  return freshBench();
}

function saveBench(b: Bench) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(b));
  } catch {
    try {
      // A very large workbook read may not fit: keep the estimate at least.
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...b, read: null }));
    } catch {
      /* storage full or blocked: the bench still works until the page is closed */
    }
  }
}

/** Everything wrong or doubtful in the bench's estimate and BCR, blockers first. */
function benchIssues(b: Bench): CrossCheck[] {
  const e = b.estimate;
  const out = [...abstractChecks(e, b.read?.abstracts ?? []), ...estimateChecks(e)];
  for (const t of b.read?.totals ?? []) {
    if (Math.abs(t.stated - t.computed) > 1)
      out.push({ id: `total:${t.sheet}:${t.row}:${t.column}`, severity: 'blocker', step: 'estimate', message: `${t.sheet} row ${t.row} “${t.label}” states ${t.column} Rs ${fmt(t.stated)}, but the items read above it add up to Rs ${fmt(t.computed)}.` });
  }
  const noRate = linesMissingRates(e);
  if (noRate.length) out.push({ id: 'no-rate', severity: 'blocker', step: 'estimate', message: `${noRate.length} ${noRate.length === 1 ? 'item has' : 'items have'} a quantity but no rate: ${noRate.map((l) => l.code || l.description.slice(0, 30)).join(', ')}.` });
  if (e.lines.length && !isBcrExempt(e) && !hasBcrInputs(e.financials)) out.push({ id: 'no-bcr', severity: 'warning', step: 'finance', message: 'BCR inputs not entered yet (additional MVA), so there is no B/C ratio.' });
  return out.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'blocker' ? -1 : 1));
}

const LG_COLS: Record<number, string> = { 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6', 7: 'lg:grid-cols-7' };

function Results({ e }: { e: Estimate }) {
  const g = generalAbstract(e);
  const f = e.financials ?? DEFAULT_FINANCIALS;
  const s = summariseFinancials(g.total, f);
  const irr = s.irr === null ? '—' : f.method === 'kptcl' ? `${Math.round(s.irr * 100)}%` : `${(s.irr * 100).toFixed(1)}%`;
  const items = [
    { label: 'Abstract-I, Rs lakh', value: lakhs(g.capital) },
    ...(hasLineWorks(e) ? [{ label: 'Line works, Rs lakh', value: lakhs(g.line) }] : []),
    ...(g.dismantling ? [{ label: 'Abstract-II, Rs lakh', value: lakhs(g.dismantling) }] : []),
    { label: 'Total cost, Rs lakh', value: lakhs(g.total) },
    { label: 'B/C ratio', value: s.bcr === null ? '—' : s.bcr.toFixed(2) },
    { label: 'IRR', value: irr },
    { label: 'Payback', value: s.discountedPayback === null ? '—' : `${s.discountedPayback} yrs` },
  ];
  return (
    <section id="bench-results" aria-label="Test results" className="scroll-mt-16">
      <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-3 ${LG_COLS[items.length] ?? 'lg:grid-cols-7'}`}>
        {items.map(({ label, value }) => (
          <div key={label} className="bg-white px-4 py-3">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="num mt-1 text-xl font-semibold tracking-tight text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Our abstracts beside the ones the workbook states, part by part. */
function CompareCard({ b }: { b: Bench }) {
  const e = b.estimate;
  const abstracts = b.read?.abstracts ?? [];
  const parts: AbstractPart[] = ['I', ...(hasLineWorks(e) ? (['line'] as const) : []), ...(e.lines.some((l) => l.section === 'dismantling') ? (['II'] as const) : [])];
  const rows = parts.map((part) => {
    const stated = abstracts.filter((a) => a.part === part && a.total).sort((x, y) => y.total! - x.total!)[0];
    const ours = abstractOf(e, part).at(-1)!.lakhs;
    return { part, sheet: stated?.sheet.trim(), stated: stated ? stated.total! / 1e5 : null, ours };
  });
  const name = (p: AbstractPart) => (p === 'I' ? 'Abstract-I (substation)' : p === 'line' ? 'Line works' : 'Abstract-II (dismantling)');
  return (
    <Card role="region" aria-labelledby="bench-compare-title">
      <CardHeader id="bench-compare-title" title="Compared with the workbook" subtitle="Total of each abstract here vs. the workbook's own abstract sheet · Rs lakh" />
      <div className="relative overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-xs text-gray-500">
            <tr className="border-b border-gray-200">
              <th className="py-2 pl-4 text-left font-medium">Part</th>
              <th className="py-2 text-left font-medium">Workbook sheet</th>
              <th className="py-2 text-right font-medium">Workbook</th>
              <th className="py-2 text-right font-medium">This app</th>
              <th className="py-2 pr-4 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => {
              const diff = r.stated === null ? null : r.ours - r.stated;
              const ok = diff !== null && Math.abs(diff) <= 0.0105;
              return (
                <tr key={r.part} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pl-4 font-sans text-gray-900">{name(r.part)}</td>
                  <td className="py-2 font-sans text-gray-500">{r.sheet ?? 'none found'}</td>
                  <td className="py-2 text-right">{r.stated === null ? '—' : lakhs(r.stated)}</td>
                  <td className="py-2 text-right">{lakhs(r.ours)}</td>
                  <td className={`py-2 pr-4 text-right ${diff === null ? 'text-gray-400' : ok ? 'text-emerald-700' : 'font-semibold text-rose-700'}`}>
                    {diff === null ? '—' : ok ? 'Matches' : `${diff > 0 ? '+' : ''}${lakhs(diff)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function IssuesCard({ issues }: { issues: CrossCheck[] }) {
  return (
    <Card role="region" aria-labelledby="bench-issues-title">
      <CardHeader id="bench-issues-title" title="Checks" subtitle="Sheet totals, workbook abstracts, Miscellaneous, duplicates, rates and BCR inputs. Recomputed on every change." />
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          No problems found.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 text-[13px]">
          {issues.map((c) => (
            <li key={c.id} className="flex items-start gap-2 px-4 py-2.5">
              <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${c.severity === 'blocker' ? 'text-rose-600' : 'text-amber-600'}`} aria-hidden />
              <span className="text-gray-800">
                <span className="mr-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">{c.severity === 'blocker' ? 'Error' : 'Check'}</span>
                {c.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const SECTIONS: EstimateSection[] = ['electrical', 'civil', 'line', 'lineCivil', 'dismantling'];

export function BoqFinancePage() {
  const toast = useToast();
  const [b, setB] = useState<Bench>(loadBench);
  const [reviewing, setReviewing] = useState(false);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => saveBench(b), [b]);

  const e = b.estimate;
  const change = (estimate: Estimate) => setB((x) => ({ ...x, estimate }));
  const issues = benchIssues(b);
  const lineWorks = hasLineWorks(e);
  const dismantling = e.lines.some((l) => l.section === 'dismantling');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    const read = await readBoqWorkbook(await blobBytes(file), file.name, b.section);
    setReading(false);
    setB((x) => ({ ...x, read }));
    setReviewing(!read.failure);
    if (fileRef.current) fileRef.current.value = '';
    if (read.failure) toast({ title: 'Could not read the file', description: read.failure, tone: 'error' });
  };
  // Each import starts from an empty estimate, so a retest never mixes with the last one. BCR inputs are kept.
  const importLines = (plan: ImportPlan, mode: ImportMode) => {
    void mode;
    const base = { ...emptyEstimate(), financials: e.financials };
    setB((x) => ({ ...x, estimate: applyImport(base, plan, 'replace'), importedAt: new Date().toISOString() }));
    setReviewing(false);
    requestAnimationFrame(() => document.getElementById('bench-results')?.scrollIntoView?.({ block: 'start' }));
    toast({ title: `Imported ${plan.lines.length} items`, description: `${b.read?.fileName} into ${plan.sections.map(sectionLabel).join(', ')}` });
  };
  const reset = () => {
    setB(freshBench());
    setReviewing(false);
  };
  const download = async () => {
    const dpr = { id: 'BOQ-TEST', project: b.read?.fileName ?? 'BOQ test', capacity: b.capacity || '—', voltage: '—', division: '—', stream: 'Greenfield' } as unknown as DprRow;
    try {
      await exportEstimate(dpr, e);
    } catch {
      toast({ title: 'Download failed', description: 'Please try again.', tone: 'error' });
    }
  };

  const read = b.read;
  const attention = read ? read.items.filter((i) => openErrors(i).length || warningsOf(i).length).length : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="BOQ test bench"
        description="Temporary. Upload one estimate workbook on its own, check what the app makes of it, fix and upload again until it is right. Not linked to any DPR: nothing here changes a real DPR."
      />
      <div className="space-y-4">
        <Card role="region" aria-labelledby="bench-file-title">
          <CardHeader
            id="bench-file-title"
            title="Workbook under test"
            subtitle="KPTCL estimate or BOQ workbook (.xlsx or old .xls). Sheets are sent to Part A, Part B, line or dismantling by their names."
            action={
              <button type="button" className="btn-ghost" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Clear the bench
              </button>
            }
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="sr-only" id="bench-file" aria-label="Workbook to test" onChange={(ev) => void onFile(ev.target.files?.[0])} />
            <label htmlFor="bench-file" className="btn-primary cursor-pointer">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {read ? 'Upload a new version' : 'Upload a workbook'}
            </label>
            {read && !read.failure && (
              <button type="button" className="btn-secondary" onClick={() => setReviewing(true)}>
                Review &amp; import again
              </button>
            )}
            <label className="flex items-center gap-1.5 text-gray-600">
              Unnamed sheets go to
              <select className="input h-8 w-auto" value={b.section} onChange={(ev) => setB((x) => ({ ...x, section: ev.target.value as EstimateSection }))}>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-gray-600">
              Capacity
              <input className="input h-8 w-32" placeholder="e.g. 1x20 MVA" value={b.capacity} onChange={(ev) => setB((x) => ({ ...x, capacity: ev.target.value }))} />
            </label>
            {e.lines.length > 0 && (
              <button type="button" className="btn-secondary ml-auto" onClick={download}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download Excel
              </button>
            )}
          </div>
          {reading && <p className="px-4 pb-3 text-[13px] text-gray-500">Reading…</p>}
          {read && (
            <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-600">
              <span className="font-medium text-gray-900">{read.fileName}</span>
              {read.failure
                ? ` · ${read.failure}`
                : ` · ${read.sheets.length} sheets, ${read.items.length} items read${attention ? `, ${attention} to check` : ', all clean'}, ${read.totals.length} sheet totals, ${(read.abstracts ?? []).length} abstract sheets`}
              {b.importedAt && ` · imported ${new Date(b.importedAt).toLocaleTimeString()}`}
            </p>
          )}
        </Card>

        {reviewing && read && <BoqReview key={read.readAt} read={read} currentLines={[]} onCancel={() => setReviewing(false)} onImport={importLines} allowConfirmAll />}

        {e.lines.length === 0 && !reviewing ? (
          <Card>
            <EmptyState icon={FlaskConical} title="Nothing imported yet" hint="Upload a workbook, look through the review, then import it to see the estimate, the abstracts and the checks." />
          </Card>
        ) : (
          e.lines.length > 0 && (
            <>
              <Results e={e} />
              <IssuesCard issues={issues} />
              <CompareCard b={b} />
              <RatePricingCard estimate={e} onChange={change} defaultOpen />
              <BoqTable section="electrical" estimate={e} onChange={change} />
              <BoqTable section="civil" estimate={e} onChange={change} />
              <AbstractCard e={e} part="I" onChange={change} />
              {lineWorks && (
                <>
                  <BoqTable section="line" estimate={e} onChange={change} />
                  <BoqTable section="lineCivil" estimate={e} onChange={change} />
                  <AbstractCard e={e} part="line" onChange={change} />
                </>
              )}
              {dismantling && (
                <>
                  <BoqTable section="dismantling" estimate={e} onChange={change} />
                  <AbstractCard e={e} part="II" onChange={change} />
                </>
              )}
              <GeneralAbstractCard e={e} brownfield={dismantling} />
              <CostBenefitCard e={e} onChange={change} capacity={b.capacity} />
            </>
          )
        )}
      </div>
    </div>
  );
}
