import { useState, type CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, Circle, FileText, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { DprDocuments } from '@/features/documents/types';
import { filesOf } from '@/features/documents/state';
import { hasLineWorks } from '@/features/preparation/calc';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { useToast } from '@/lib/toast';
import { ANNEXURES, downloadDprDocx } from './buildDocx';
import { DETAIL_FIELDS, PLACEHOLDER, applies, contentOf, letteredSections, type DetailKey, type DprContent, type SalientRow, type SectionKey, type SimpleTable, type TableKey } from './content';
import { STEPS, dprChecklist, type Gap, type StepKey } from './readiness';

interface Props {
  dpr: DprRow;
  estimate: Estimate;
  documents: DprDocuments;
  onChange: (e: Estimate) => void;
}

const grow = { fieldSizing: 'content' } as CSSProperties;
const isOpen = (v: string | undefined) => !v?.trim() || PLACEHOLDER.test(v);

/** Saves a change to the DPR's text inside the estimate record. */
function useContent(dpr: DprRow, estimate: Estimate, onChange: (e: Estimate) => void) {
  const content = contentOf(dpr, estimate);
  const save = (patch: Partial<DprContent>) => onChange({ ...estimate, document: { ...content, ...patch } });
  return { content, save };
}

function TableEditor({ table, onChange, label }: { table: SimpleTable; onChange: (t: SimpleTable) => void; label: string }) {
  const setCell = (r: number, c: number, v: string) => onChange({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const addRow = () => onChange({ ...table, rows: [...table.rows, table.columns.map((_, i) => (i === 0 ? String(table.rows.length + 1) : ''))] });
  const removeRow = (r: number) => onChange({ ...table, rows: table.rows.filter((_, i) => i !== r) });
  return (
    <div className="mt-2 rounded-md border border-gray-200">
      <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5">
        <input aria-label={`${label} table title`} className="input h-7 flex-1 text-xs font-medium" value={table.title} onChange={(ev) => onChange({ ...table, title: ev.target.value })} />
        <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={addRow}>
          <Plus className="h-3 w-3" aria-hidden /> Add row
        </button>
      </div>
      {table.rows.length ? (
        <table className="w-full text-xs" aria-label={`${label} table`}>
          <thead>
            <tr className="text-gray-500">
              {table.columns.map((c) => (
                <th key={c} className="px-2 py-1 text-left font-medium">
                  {c}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="border-t border-gray-100">
                {row.map((v, c) => (
                  <td key={c} className="px-1 py-0.5">
                    <input aria-label={`${table.columns[c]}, row ${r + 1}`} className="input h-7 w-full text-xs" value={v} onChange={(ev) => setCell(r, c, ev.target.value)} />
                  </td>
                ))}
                <td className="px-1">
                  <button type="button" aria-label={`Remove row ${r + 1}`} className="btn-ghost h-7 px-1.5" onClick={() => removeRow(r)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-2 py-2 text-xs text-gray-500">No rows. The table is left out of the DPR until you add one.</p>
      )}
    </div>
  );
}

function SalientEditor({ rows, onChange }: { rows: SalientRow[]; onChange: (rows: SalientRow[]) => void }) {
  const set = (i: number, patch: Partial<SalientRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
          <input aria-label={`Salient feature ${i + 1} heading`} className="input h-8 text-xs font-medium uppercase" value={r.label} onChange={(ev) => set(i, { label: ev.target.value })} />
          <textarea aria-label={`Salient feature ${i + 1}: ${r.label}`} rows={1} style={grow} className={`input min-h-[2rem] py-1.5 ${isOpen(r.value) ? 'border-amber-300' : ''}`} value={r.value} onChange={(ev) => set(i, { value: ev.target.value })} />
          <button type="button" aria-label={`Remove ${r.label}`} className="btn-ghost h-8 px-1.5" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onChange([...rows, { label: '', value: '' }])}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add salient feature
      </button>
    </div>
  );
}

const GROUPS = [
  { key: 'glance', title: '01 Project at a glance', subtitle: 'Fact rows in section 01. Cost, BCR, IRR and payback are filled in from the estimate.' },
  { key: 'cover', title: 'Cover and page footer', subtitle: 'APW code, jurisdiction, consultant and month, as on the cover' },
  { key: 'abstract', title: 'General abstract', subtitle: 'Estimate titles, certificate and who signs it' },
] as const;

/** Step 5: everything written by hand, in the order it appears in the DPR. */
export function ReportTextPanel({ dpr, estimate, onChange }: Omit<Props, 'documents'>) {
  const { content, save } = useContent(dpr, estimate, onChange);
  const lineWorks = hasLineWorks(estimate);
  const setDetail = (key: DetailKey, value: string) => save({ details: { ...content.details, [key]: value } });
  const setSection = (key: SectionKey, value: string) => save({ sections: { ...content.sections, [key]: value } });
  const setTable = (key: TableKey, t: SimpleTable) => save({ tables: { ...content.tables, [key]: t } });
  const lettered = letteredSections(lineWorks);
  const salientLetter = String.fromCharCode(97 + lettered.length);

  return (
    <div className="space-y-4">
      {GROUPS.map((grp) => (
        <Card key={grp.key} role="region" aria-labelledby={`dpr-${grp.key}-title`}>
          <CardHeader id={`dpr-${grp.key}-title`} title={grp.title} subtitle={grp.subtitle} />
          <div className="grid gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-2">
            {DETAIL_FIELDS.filter((f) => f.group === grp.key && applies(f, lineWorks)).map((f) => {
              const value = content.details[f.key] ?? '';
              const warn = !('optional' in f) && isOpen(value);
              return (
                <label key={f.key} className={`block text-[13px] ${'multiline' in f ? 'sm:col-span-2' : ''}`}>
                  <span className="label-muted mb-1 block">{f.label}</span>
                  {'multiline' in f ? (
                    <textarea rows={2} style={grow} className={`input min-h-[3rem] w-full py-1.5 ${warn ? 'border-amber-300' : ''}`} value={value} placeholder={'placeholder' in f ? f.placeholder : undefined} onChange={(ev) => setDetail(f.key, ev.target.value)} />
                  ) : (
                    <input className={`input ${warn ? 'border-amber-300' : ''}`} value={value} placeholder={'placeholder' in f ? f.placeholder : undefined} onChange={(ev) => setDetail(f.key, ev.target.value)} />
                  )}
                </label>
              );
            })}
          </div>
        </Card>
      ))}

      <Card role="region" aria-labelledby="dpr-sections-title">
        <CardHeader
          id="dpr-sections-title"
          title="02 Project report"
          subtitle="Replace every [bracketed] note with the project’s own text. Start lines with 1., 2. … for numbered points; a blank line starts a new paragraph."
        />
        <div className="divide-y divide-gray-100">
          {lettered.flatMap(({ letter, parts }) =>
            parts.map((s) => {
              const value = content.sections[s.key];
              return (
                <div key={s.key} className="px-4 py-3 text-[13px]">
                  <label className="block">
                    <span className="mb-1 flex items-center gap-2">
                      <span className="num text-gray-400">{letter}.</span>
                      <span className="font-medium text-gray-900">{s.title}</span>
                      {isOpen(value) && <span className="text-xs text-amber-700">to write</span>}
                    </span>
                    <textarea value={value} onChange={(ev) => setSection(s.key, ev.target.value)} style={grow} className="input min-h-[4.5rem] w-full py-1.5 leading-relaxed" />
                  </label>
                  {'table' in s && <TableEditor label={s.title} table={content.tables[s.key as TableKey]} onChange={(t) => setTable(s.key as TableKey, t)} />}
                </div>
              );
            }),
          )}
          <div className="px-4 py-3 text-[13px]">
            <p className="mb-2 flex items-center gap-2">
              <span className="num text-gray-400">{salientLetter}.</span>
              <span className="font-medium text-gray-900">Salient features</span>
            </p>
            <SalientEditor rows={content.salient} onChange={(salient) => save({ salient })} />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** The DPR's parts in order, with whether each is ready, and where it comes from. */
function outline(e: Estimate, docs: DprDocuments, content: DprContent, gaps: Gap[]) {
  const lineWorks = hasLineWorks(e);
  const has = (step: StepKey) => gaps.some((g) => g.step === step);
  const textGap = (needle: RegExp) => gaps.some((g) => g.step === 'text' && needle.test(g.label));
  const missing = (label: string) => gaps.some((g) => g.label === `text: ${label}`);
  const glanceKeys = DETAIL_FIELDS.filter((f) => f.group === 'glance' && applies(f, lineWorks)).map((f) => f.label);
  const coverKeys = DETAIL_FIELDS.filter((f) => f.group === 'cover').map((f) => f.label);
  const rows: { no: string; title: string; ok: boolean; note: string; step: StepKey }[] = [
    { no: '', title: 'Cover', ok: !coverKeys.some(missing) && !has('finance'), note: 'Cost, B/C, IRR and payback from the estimate', step: 'text' },
    { no: '1.', title: 'Project at a glance', ok: !glanceKeys.some(missing), note: `${glanceKeys.length} fact rows + KPI strip`, step: 'text' },
    { no: '2.', title: `Project report (a–${String.fromCharCode(97 + letteredSections(lineWorks).length)})`, ok: !textGap(/^text: [a-z]\. |Salient|Tower schedule/), note: lineWorks ? 'Includes the tower schedule' : 'No line works, so no tower schedule', step: 'text' },
    { no: '3.', title: 'Estimates & abstract', ok: !has('estimate') && !textGap(/estimate title|Certificate|Signed by/), note: 'General abstract, abstracts and BOQ sheets', step: 'estimate' },
    { no: '4.', title: 'PERT chart', ok: !has('schedule'), note: `${content.pert.completionMonths} months from ${content.pert.zeroDate}`, step: 'schedule' },
  ];
  for (const a of ANNEXURES.filter((x) => !x.generated || x.no === '6')) {
    if (a.no === '6') {
      rows.push({ no: '6.', title: a.title, ok: !has('finance'), note: e.financials?.method === 'manual' ? 'From benefits entered by hand' : 'KPTCL method: inputs, appraisal and 30-year schedule', step: 'finance' });
      continue;
    }
    const files = a.docs.flatMap((k) => filesOf(docs, k).map((f) => f.name));
    rows.push({ no: `${a.no}.`, title: a.title, ok: files.length > 0, note: files.length ? `Enclose: ${files.join(', ')}` : 'Attach in Documents', step: 'inputs' });
  }
  return rows.sort((x, y) => (parseInt(x.no) || 0) - (parseInt(y.no) || 0));
}

/** Step 6: one place that says what is missing and generates the full DPR. */
export function GenerateDprPanel({ dpr, estimate, documents, onGoTo }: Omit<Props, 'onChange'> & { onGoTo: (step: StepKey) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const content = contentOf(dpr, estimate);
  const checklist = dprChecklist(estimate, documents, content);
  const gaps = checklist.map((g) => g.label);
  const parts = outline(estimate, documents, content, checklist);

  const download = async () => {
    setBusy(true);
    try {
      await downloadDprDocx({ dpr, estimate, documents, content, gaps });
      toast(gaps.length ? { title: 'Draft DPR generated', description: `${gaps.length} items still missing; the cover is marked DRAFT.`, tone: 'info' } : { title: 'Full DPR generated', description: dpr.id });
    } catch {
      toast({ title: 'Generation failed', description: 'Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card role="region" aria-labelledby="dpr-doc-title">
        <CardHeader
          id="dpr-doc-title"
          title="Generate full DPR"
          subtitle="Cover, contents, sections 1–2, estimates, PERT chart and BCR as one Word file, laid out like the Thyavanige DPR"
          action={
            <button type="button" className="btn-primary" onClick={download} disabled={busy}>
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {busy ? 'Preparing…' : gaps.length ? 'Generate draft DPR (Word)' : 'Generate full DPR (Word)'}
            </button>
          }
        />
        <div className="px-4 py-3 text-[13px]">
          {gaps.length ? (
            <div role="status" className="flex items-start gap-2 text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {gaps.length} {gaps.length === 1 ? 'thing is' : 'things are'} still missing, so the Word file will be marked DRAFT. Fix them step by step below.
              </p>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Everything is in place. The DPR is ready for submission.
            </p>
          )}
        </div>
      </Card>

      <Card role="region" aria-labelledby="dpr-outline-title">
        <CardHeader id="dpr-outline-title" title="What goes into the DPR" subtitle="Annexures 5, 7, 8 and 9 are your attached files; enclose them after the Word pages when printing" />
        <ol className="divide-y divide-gray-100">
          {parts.map((p) => (
            <li key={p.title} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
              {p.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Ready" /> : <Circle className="h-4 w-4 text-amber-500" aria-label="Not ready" />}
              <span className="num w-6 text-gray-400">{p.no}</span>
              <span className="min-w-[12rem] flex-1 text-gray-900">{p.title}</span>
              <span className="text-xs text-gray-500">{p.note}</span>
              {!p.ok && (
                <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => onGoTo(p.step)}>
                  Fix <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      </Card>

      {gaps.length > 0 && (
        <Card role="region" aria-labelledby="dpr-missing-title">
          <CardHeader id="dpr-missing-title" title="Still missing" subtitle="Grouped by the step where you fix it" />
          <div className="divide-y divide-gray-100">
            {STEPS.filter((s) => checklist.some((g) => g.step === s.key)).map((s) => {
              const items = checklist.filter((g) => g.step === s.key);
              return (
                <div key={s.key} className="px-4 py-2.5 text-[13px]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-gray-900">{s.label}</span>
                    <span className="text-xs text-gray-500">{items.length}</span>
                    <button type="button" className="btn-ghost ml-auto h-7 px-2 text-xs" onClick={() => onGoTo(s.key)}>
                      Go to step <ArrowRight className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-700 sm:columns-2">
                    {items.map((g) => (
                      <li key={g.label}>{g.label.replace(/^(text|document|PERT): /, '')}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
