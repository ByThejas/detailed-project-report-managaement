import { useState, type CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, Circle, FileDown, FileText, Plus, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { DprDocuments } from '@/features/documents/types';
import { filesOf } from '@/features/documents/state';
import { hasLineWorks } from '@/features/preparation/calc';
import { isBcrExempt } from '@/features/preparation/finance';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { useToast } from '@/lib/toast';
import { ANNEXURES, downloadDprDocx } from './buildDocx';
import { DETAIL_FIELDS, PLACEHOLDER, applies, contentOf, letteredSections, type DetailKey, type DprContent, type SalientRow, type SectionKey, type SimpleTable, type TableKey } from './content';
import { STEPS, dprChecklist, gapOfCheck, type Gap, type StepKey } from './readiness';
import { openBlockers, type Acknowledgement, type CrossCheck } from './crossChecks';
import { downloadPdfPack, type PackResult } from './pdfPack';
import { blobBytes, getFile } from '@/lib/fileStore';
import { extractFacts, readFileText, type FactSuggestion, type FileText as ReadText } from './extract';
import { EMPTY_LOAD } from '@/features/preparation/load';
import { EstimatePdfCard } from '@/features/estimate-pdf/EstimatePdfCard';
import { bcrHtml, coverHtml, dprHtml, openSheet, pertHtml, sheetSet } from './sheets';
import { estimateWorkbooks, finalEstimatePdfBytes } from '@/features/estimate-pdf/estimatePdfBytes';
import { MAX_VERSIONS, diffVersions, listVersions, saveVersion, snapshot, type DprVersion } from './versions';
import { Draftable } from './draft/Draftable';
import type { DraftContext } from './draft/generate';

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

function TableEditor({ table, onChange, label, fix }: { table: SimpleTable; onChange: (t: SimpleTable) => void; label: string; fix?: string }) {
  const setCell = (r: number, c: number, v: string) => onChange({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const addRow = () => onChange({ ...table, rows: [...table.rows, table.columns.map((_, i) => (i === 0 ? String(table.rows.length + 1) : ''))] });
  const removeRow = (r: number) => onChange({ ...table, rows: table.rows.filter((_, i) => i !== r) });
  return (
    <div className="mt-2 rounded-md border border-gray-200" data-fix={fix}>
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
                    <input aria-label={`${table.columns[c]}, row ${r + 1}`} data-fix-focus={r === 0 && c === 1 ? '' : undefined} className="input h-7 w-full text-xs" value={v} onChange={(ev) => setCell(r, c, ev.target.value)} />
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

function SalientEditor({ rows, onChange, ctx = null }: { rows: SalientRow[]; onChange: (rows: SalientRow[]) => void; ctx?: DraftContext | null }) {
  const set = (i: number, patch: Partial<SalientRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <Draftable key={i} target={{ kind: 'salient', label: r.label || `Salient feature ${i + 1}` }} ctx={ctx} current={r.value} onUse={(value) => set(i, { value })}>
          {({ id, button, panel }) => (
            <div data-fix={`salient:${i}`}>
              <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
                <input aria-label={`Salient feature ${i + 1} heading`} className="input h-8 text-xs font-medium uppercase" value={r.label} onChange={(ev) => set(i, { label: ev.target.value })} />
                <textarea id={id} data-fix-focus="" aria-label={`Salient feature ${i + 1}: ${r.label}`} rows={1} style={grow} className={`input min-h-[2rem] py-1.5 ${isOpen(r.value) ? 'border-amber-300' : ''}`} value={r.value} onChange={(ev) => set(i, { value: ev.target.value })} />
                <div className="flex items-start gap-1">
                  {button && <span className="pt-1">{button}</span>}
                  <button type="button" aria-label={`Remove ${r.label}`} className="btn-ghost h-8 px-1.5" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              {panel}
            </div>
          )}
        </Draftable>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onChange([...rows, { label: '', value: '' }])}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add salient feature
      </button>
    </div>
  );
}

/**
 * Reads the attached files and suggests facts for the DPR. Each suggestion shows its file, page and the
 * words around it; nothing is filled in until the user clicks Use.
 */
function FileFactsCard({ dpr, estimate, documents, onChange }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<FactSuggestion[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const content = contentOf(dpr, estimate);
  const attached = Object.entries(documents.files).flatMap(([key, fs]) => fs.map((f) => ({ key, name: f.name })));

  const scan = async () => {
    setBusy(true);
    try {
      const texts: ReadText[] = [];
      const missing: string[] = [];
      for (const a of attached) {
        const f = await getFile(dpr.id, a.key, a.name);
        if (!f) {
          missing.push(`${a.name}: not stored in this browser; attach it again in Documents to scan it`);
          continue;
        }
        const t = await readFileText({ name: f.name, type: f.type, bytes: f.data }, a.key);
        if (t.note) missing.push(`${a.name}: ${t.note}`);
        texts.push(t);
      }
      setFound(extractFacts(texts));
      setNotes(missing);
      setDone(new Set());
    } catch {
      toast({ title: 'Could not read the files', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const current = (s: FactSuggestion): string => {
    const t = s.target;
    if (t.kind === 'detail') return content.details[t.key] ?? '';
    if (t.kind === 'salient') return content.salient.find((r) => r.label === t.label)?.value ?? '';
    return String(estimate.load?.[t.key] ?? '');
  };
  const use = (s: FactSuggestion) => {
    const t = s.target;
    if (t.kind === 'detail') onChange({ ...estimate, document: { ...content, details: { ...content.details, [t.key]: s.value } } });
    else if (t.kind === 'salient') {
      const has = content.salient.some((r) => r.label === t.label);
      const salient = has ? content.salient.map((r) => (r.label === t.label ? { ...r, value: s.value } : r)) : [...content.salient, { label: t.label, value: s.value }];
      onChange({ ...estimate, document: { ...content, salient } });
    } else {
      const load = { ...EMPTY_LOAD, ...estimate.load, [t.key]: t.key === 'peakMw' ? Number(s.value) : s.value };
      onChange({ ...estimate, load });
    }
    setDone((d) => new Set(d).add(s.id));
    toast({ title: `${s.label} filled in`, description: `From ${s.file}${s.page ? `, page ${s.page}` : ''}` });
  };
  const shown = (found ?? []).filter((s) => !done.has(s.id) && current(s).trim() !== s.value);

  return (
    <Card role="region" aria-labelledby="dpr-facts-title">
      <CardHeader
        id="dpr-facts-title"
        title="Suggestions from your files"
        subtitle="Reads the attached TCCM proceedings, layout/BOM, earthmat and load files for approval, APW code, budget, letters and load. You check each one before it is used."
        action={
          <button type="button" className="btn-secondary" onClick={scan} disabled={busy || !attached.length}>
            {busy ? 'Reading…' : 'Scan attached files'}
          </button>
        }
      />
      {!attached.length ? (
        <p className="px-4 py-3 text-[13px] text-gray-500">No files attached yet.</p>
      ) : found === null ? null : (
        <div className="text-[13px]">
          {shown.length ? (
            <ul className="divide-y divide-gray-100" aria-label="Suggested facts">
              {shown.map((s) => (
                <li key={s.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-[16rem] flex-1">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className="text-gray-900">{s.value}</p>
                      {current(s).trim() && <p className="text-xs text-gray-500">Now: {current(s)}</p>}
                      <p className="mt-0.5 text-xs text-gray-500">
                        From {s.file}
                        {s.page ? `, page ${s.page}` : ''}: <q className="italic">{s.snippet}</q>
                      </p>
                    </div>
                    <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => use(s)}>
                      Use
                    </button>
                    <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => setDone((d) => new Set(d).add(s.id))}>
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-4 py-3 text-gray-500">
              No new facts found in the attached files.
            </p>
          )}
          {notes.length > 0 && (
            <ul className="list-disc border-t border-gray-100 py-2 pl-9 pr-4 text-xs text-amber-800">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

const GROUPS = [
  { key: 'glance', title: '01 Project at a glance', subtitle: 'Fact rows in section 01. Cost, BCR, IRR and payback are filled in from the estimate.' },
  { key: 'cover', title: 'Cover and page footer', subtitle: 'APW code, jurisdiction, consultant and month, as on the cover' },
  { key: 'abstract', title: 'General abstract', subtitle: 'Estimate titles, certificate and who signs it' },
] as const;

/** Step 5: everything written by hand, in the order it appears in the DPR. */
export function ReportTextPanel({ dpr, estimate, onChange, documents }: Omit<Props, 'documents'> & { documents?: DprDocuments }) {
  const { content, save } = useContent(dpr, estimate, onChange);
  const lineWorks = hasLineWorks(estimate);
  const setDetail = (key: DetailKey, value: string) => save({ details: { ...content.details, [key]: value } });
  const setSection = (key: SectionKey, value: string) => save({ sections: { ...content.sections, [key]: value } });
  const setTable = (key: TableKey, t: SimpleTable) => save({ tables: { ...content.tables, [key]: t } });
  const lettered = letteredSections(lineWorks, isBcrExempt(estimate));
  const salientLetter = String.fromCharCode(97 + lettered.length);
  // With the DPR's documents, every field gets a Generate button that drafts it from them.
  const ctx: DraftContext | null = documents ? { dpr, estimate, documents, content } : null;

  return (
    <div className="space-y-4">
      {documents && <FileFactsCard dpr={dpr} estimate={estimate} documents={documents} onChange={onChange} />}
      {GROUPS.map((grp) => (
        <Card key={grp.key} role="region" aria-labelledby={`dpr-${grp.key}-title`}>
          <CardHeader id={`dpr-${grp.key}-title`} title={grp.title} subtitle={grp.subtitle} />
          <div className="grid gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-2">
            {DETAIL_FIELDS.filter((f) => f.group === grp.key && applies(f, lineWorks)).map((f) => {
              const value = content.details[f.key] ?? '';
              const warn = !('optional' in f) && isOpen(value);
              return (
                <Draftable key={f.key} target={{ kind: 'detail', key: f.key }} ctx={ctx} current={value} onUse={(text) => setDetail(f.key, text)}>
                  {({ id, button, panel }) => (
                    <div data-fix={`detail:${f.key}`} className={`text-[13px] ${'multiline' in f ? 'sm:col-span-2' : ''}`}>
                      <div className="mb-1 flex min-h-6 items-center justify-between gap-2">
                        <label htmlFor={id} className="label-muted">
                          {f.label}
                        </label>
                        {button}
                      </div>
                      {'multiline' in f ? (
                        <textarea id={id} rows={2} style={grow} className={`input min-h-[3rem] w-full py-1.5 ${warn ? 'border-amber-300' : ''}`} value={value} placeholder={'placeholder' in f ? f.placeholder : undefined} onChange={(ev) => setDetail(f.key, ev.target.value)} />
                      ) : (
                        <input id={id} className={`input w-full ${warn ? 'border-amber-300' : ''}`} value={value} placeholder={'placeholder' in f ? f.placeholder : undefined} onChange={(ev) => setDetail(f.key, ev.target.value)} />
                      )}
                      {panel}
                    </div>
                  )}
                </Draftable>
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
                <Draftable key={s.key} target={{ kind: 'section', key: s.key }} ctx={ctx} current={value} onUse={(text) => setSection(s.key, text)}>
                  {({ id, button, panel }) => (
                    <div data-fix={`section:${s.key}`} className="px-4 py-3 text-[13px]">
                      <div className="mb-1 flex items-center gap-2">
                        <label htmlFor={id} className="flex items-center gap-2">
                          <span className="num text-gray-400">{letter}.</span>
                          <span className="font-medium text-gray-900">{s.title}</span>
                        </label>
                        {isOpen(value) && <span className="text-xs text-amber-700">to write</span>}
                        <span className="ml-auto">{button}</span>
                      </div>
                      <textarea id={id} value={value} onChange={(ev) => setSection(s.key, ev.target.value)} style={grow} className="input min-h-[4.5rem] w-full py-1.5 leading-relaxed" />
                      {panel}
                      {'table' in s && <TableEditor fix={`table:${s.key}`} label={s.title} table={content.tables[s.key as TableKey]} onChange={(t) => setTable(s.key as TableKey, t)} />}
                    </div>
                  )}
                </Draftable>
              );
            }),
          )}
          <div className="px-4 py-3 text-[13px]">
            <p className="mb-2 flex items-center gap-2">
              <span className="num text-gray-400">{salientLetter}.</span>
              <span className="font-medium text-gray-900">Salient features</span>
            </p>
            <SalientEditor rows={content.salient} onChange={(salient) => save({ salient })} ctx={ctx} />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** The DPR's parts in order, with whether each is ready, and where it comes from. */
function outline(e: Estimate, docs: DprDocuments, content: DprContent, gaps: Gap[]) {
  const lineWorks = hasLineWorks(e);
  const noBcr = isBcrExempt(e);
  const has = (step: StepKey) => gaps.some((g) => g.step === step);
  const textGap = (needle: RegExp) => gaps.some((g) => g.step === 'text' && needle.test(g.label));
  const missing = (label: string) => gaps.some((g) => g.label === `text: ${label}`);
  const first = (test: (g: Gap) => boolean) => gaps.find(test);
  const inLabels = (labels: string[]) => (g: Gap) => labels.some((l) => g.label === `text: ${l}`);
  const glanceKeys = DETAIL_FIELDS.filter((f) => f.group === 'glance' && applies(f, lineWorks)).map((f) => f.label);
  const coverKeys = DETAIL_FIELDS.filter((f) => f.group === 'cover').map((f) => f.label);
  const report = /^text: [a-z]\. |Salient|Tower schedule/;
  const estimateText = /estimate title|Certificate|Signed by/;
  const rows: { no: string; title: string; ok: boolean; note: string; step: StepKey; gap?: Gap }[] = [
    { no: '', title: 'Cover', ok: !coverKeys.some(missing) && !has('finance'), note: noBcr ? 'Cost from the estimate; route length, towers and bays (no BCR for pure line works)' : 'Cost, B/C, IRR and payback from the estimate', step: 'text', gap: first(inLabels(coverKeys)) ?? first((g) => g.step === 'finance') },
    { no: '1.', title: 'Project at a glance', ok: !glanceKeys.some(missing), note: `${glanceKeys.length} fact rows + ${noBcr ? 'line scale strip' : 'KPI strip'}`, step: 'text', gap: first(inLabels(glanceKeys)) },
    { no: '2.', title: `Project report (a–${String.fromCharCode(97 + letteredSections(lineWorks, noBcr).length)})`, ok: !textGap(report), note: lineWorks ? 'Includes the tower schedule' : 'No line works, so no tower schedule', step: 'text', gap: first((g) => g.step === 'text' && report.test(g.label)) },
    { no: '3.', title: 'Estimates & abstract', ok: !has('estimate') && !textGap(estimateText), note: 'General abstract, abstracts and BOQ sheets', step: 'estimate', gap: first((g) => g.step === 'estimate') ?? first((g) => g.step === 'text' && estimateText.test(g.label)) },
    { no: '4.', title: 'PERT chart', ok: !has('schedule'), note: `${content.pert.completionMonths} months from ${content.pert.zeroDate}`, step: 'schedule', gap: first((g) => g.step === 'schedule') },
  ];
  for (const a of ANNEXURES.filter((x) => !x.generated || (x.no === '6' && !noBcr))) {
    if (a.no === '6') {
      rows.push({ no: '6.', title: a.title, ok: !has('finance'), note: e.financials?.method === 'manual' ? 'From benefits entered by hand' : 'KPTCL method: inputs, appraisal and 30-year schedule', step: 'finance', gap: first((g) => g.step === 'finance') });
      continue;
    }
    const files = a.docs.flatMap((k) => filesOf(docs, k).map((f) => f.name));
    const attach: Gap = {
      id: `annex:${a.no}`,
      step: 'inputs',
      label: `Annexure ${a.no}: ${a.title}`,
      target: a.docs[0] ? `doc:${a.docs[0]}` : undefined,
      how: `Press “Upload” on the highlighted row and choose the ${a.title} file. It is enclosed in the final DPR as Annexure ${a.no}.`,
    };
    rows.push({ no: `${a.no}.`, title: a.title, ok: files.length > 0, note: files.length ? `Enclose: ${files.join(', ')}` : 'Not attached yet', step: 'inputs', gap: files.length ? undefined : attach });
  }
  return rows.sort((x, y) => (parseInt(x.no) || 0) - (parseInt(y.no) || 0));
}

/** The cover, PERT chart and BCR analysis as printable pages in the style of the Thyavanige DPR's PDF. */
function PrintSheetsCard({ dpr, estimate }: { dpr: DprRow; estimate: Estimate }) {
  const toast = useToast();
  const set = sheetSet(dpr, estimate);
  const open = (html: string | null) => {
    if (html && !openSheet(html)) toast({ title: 'The page was blocked', description: 'Allow pop-ups for this site and try again.', tone: 'error' });
  };
  const items = [
    { key: 'cover', label: 'Cover page', note: 'A4 portrait, as the KPTCL cover generator', html: () => coverHtml(set), why: undefined as string | undefined },
    { key: 'pert', label: 'PERT chart', note: 'Annexure 4, A4 landscape, as the KPTCL PERT chart generator', html: () => pertHtml(set), why: undefined },
    { key: 'bcr', label: 'BCR analysis', note: 'Annexure 6, two A4 landscape pages, as the KPTCL BCR calculator', html: () => bcrHtml(set), why: set.bcr ? undefined : set.bcrWhy },
  ];
  return (
    <Card role="region" aria-labelledby="dpr-sheets-title">
      <CardHeader id="dpr-sheets-title" title="Single pages" subtitle="The cover, PERT chart or BCR on their own, each in a new tab to print or save as PDF. They are also part of the full DPR above." />
      <ul className="divide-y divide-gray-100">
        {items.map((it) => (
          <li key={it.key} className="flex min-h-11 items-center gap-x-3 px-4 py-2 text-[13px]">
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-gray-900">{it.label}</span>
              <span className={it.why ? 'text-xs text-amber-700' : 'text-xs text-gray-500'}>{it.why ?? it.note}</span>
            </span>
            <button type="button" className="btn-secondary h-7 shrink-0 px-2 text-xs" onClick={() => open(it.html())} disabled={!!it.why} aria-label={`Open ${it.label} to print`}>
              <Printer className="h-3 w-3" aria-hidden />
              Open
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The final DPR as one PDF, in the Thyavanige order: the printed DPR pages with the estimates and attached annexures slotted in. */
function PdfPackCard({ dpr, estimate, documents }: { dpr: DprRow; estimate: Estimate; documents: DprDocuments }) {
  const toast = useToast();
  const [front, setFront] = useState<File | null>(null);
  const [estimates, setEstimates] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PackResult | null>(null);
  const [sheetsAdded, setSheetsAdded] = useState<string[]>([]);
  const hasBcr = !isBcrExempt(estimate);
  const build = async () => {
    setBusy(true);
    try {
      // The estimate sheets in the set order, with the uploaded workbook's other sheets in their places.
      const books = await estimateWorkbooks(dpr.id, documents).catch(() => ({ workbooks: [], missing: [] as string[] }));
      const made = await finalEstimatePdfBytes(dpr, estimate, books.workbooks, { withEstimate: !estimates, fallback: { paper: 'a4' } }).catch(() => null);
      const buf = (b: Uint8Array | null | undefined) => (b ? (b.slice().buffer as ArrayBuffer) : undefined);
      const r = await downloadPdfPack({
        dpr,
        documents,
        hasBcr,
        front: front ? await blobBytes(front) : undefined,
        estimates: estimates ? await blobBytes(estimates) : buf(made?.bytes),
        estimateExtras: estimates ? buf(made?.bytes) : undefined,
        fileOf: async (key, name) => {
          const f = await getFile(dpr.id, key, name);
          return f ? { name: f.name, type: f.type, bytes: f.data } : undefined;
        },
      });
      r.skipped.push(...books.missing.map((name) => ({ name, why: 'estimate workbook not kept in this browser; upload it again under BOQ estimate to add its other sheets' })));
      setSheetsAdded(made?.fromWorkbooks ?? []);
      setResult(r);
      toast({ title: `Final DPR ready: ${r.pages} pages`, description: r.skipped.length ? `${r.skipped.length} files left out; see the list.` : undefined, tone: r.skipped.length || !r.ordered ? 'info' : undefined });
    } catch {
      toast({ title: 'Could not build the final DPR', description: 'Check that the chosen files are PDFs.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card role="region" aria-labelledby="dpr-pack-title">
      <CardHeader
        id="dpr-pack-title"
        title="Final DPR (one PDF)"
        subtitle="In the Thyavanige order: cover, contents and report, estimates (general abstract; station, line, UG, TB and dismantling sheets; then the estimate workbook's other sheets), PERT chart, grid map, BCR, TCCM extract, layout and BOM, earthmat report"
        action={
          <button type="button" className="btn-secondary" onClick={build} disabled={busy}>
            {busy ? 'Building…' : 'Build final DPR'}
          </button>
        }
      />
      <div className="space-y-3 px-4 py-3 text-[13px]">
        <label className="block">
          <span className="label-muted mb-1 block">DPR pages saved as PDF</span>
          <input type="file" accept="application/pdf,.pdf" aria-label="DPR pages saved as PDF" onChange={(ev) => setFront(ev.target.files?.[0] ?? null)} className="text-xs" />
          <span className="mt-1 block text-xs text-gray-500">Use “Open DPR to print” above and save it as PDF from that tab, then choose the file here.</span>
        </label>
        <label className="block">
          <span className="label-muted mb-1 block">Abstract &amp; Estimate PDF (optional)</span>
          <input type="file" accept="application/pdf,.pdf" aria-label="Abstract and Estimate PDF" onChange={(ev) => setEstimates(ev.target.files?.[0] ?? null)} className="text-xs" />
          <span className="mt-1 block text-xs text-gray-500">Left empty, it is made from the estimate with your PDF editor settings. Either way the uploaded estimate workbook&apos;s other sheets follow in their order.</span>
        </label>
        <p className="text-xs text-gray-500">Attached PDFs and images go in as they are. Other files, such as the BOQ workbook, are left out; save them as PDF and attach that. Files attached in another browser need attaching again.</p>
        {result && (
          <div role="status" className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <p className="text-gray-900">
              {result.pages} pages. Attachments: {result.included.length ? result.included.join(', ') : 'none'}.
            </p>
            {sheetsAdded.length > 0 && <p className="mt-1 text-gray-700">From the estimate workbook: {sheetsAdded.join(', ')}.</p>}
            {!result.ordered && <p className="mt-1 text-amber-800">The DPR PDF was not the one printed from “Open DPR to print”, so it went in front as it is.</p>}
            {result.skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-amber-800">
                {result.skipped.map((x) => (
                  <li key={x.name}>
                    {x.name}: {x.why}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Every generated DPR, newest first, with what changed from the one before. Any version can be downloaded again. */
function VersionsCard({ versions, pending }: { versions: DprVersion[]; pending: string[] }) {
  const toast = useToast();
  const again = async (v: DprVersion) => {
    try {
      await downloadDprDocx({ dpr: v.dpr, estimate: v.estimate, documents: v.documents, content: contentOf(v.dpr, v.estimate), gaps: v.gaps, now: new Date(v.at), version: v.version });
    } catch {
      toast({ title: 'Could not rebuild that version', tone: 'error' });
    }
  };
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Card role="region" aria-labelledby="dpr-versions-title">
      <CardHeader id="dpr-versions-title" title="Version history" subtitle={`Each generated DPR is kept in this browser (last ${MAX_VERSIONS}), with what changed from the one before`} />
      {!versions.length ? (
        <p className="px-4 py-3 text-[13px] text-gray-500">No DPR generated yet. The first one becomes version 1.</p>
      ) : (
        <div className="text-[13px]">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="font-medium text-gray-900">Since v{versions.at(-1)!.version}</p>
            {pending.length ? (
              <ul aria-label="Changes since the last version" className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-700">
                {pending.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">Nothing has changed.</p>
            )}
          </div>
          <ol className="divide-y divide-gray-100">
            {[...versions].reverse().map((v, i, arr) => {
              const prev = arr[i + 1];
              const changes = prev ? diffVersions(prev, v) : [];
              return (
                <li key={v.version} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-gray-900">v{v.version}</span>
                    <span className="text-xs text-gray-500">{when(v.at)}</span>
                    <span className="num text-xs text-gray-700">
                      Rs {v.totalLakhs.toFixed(2)} lakh{v.bcr !== null && ` · BCR ${v.bcr.toFixed(2)}`}
                    </span>
                    <span className={`text-xs ${v.gaps.length ? 'text-amber-700' : 'text-emerald-700'}`}>{v.gaps.length ? `Draft, ${v.gaps.length} missing` : 'Complete'}</span>
                    <button type="button" className="btn-ghost ml-auto h-7 px-2 text-xs" onClick={() => again(v)}>
                      Download v{v.version}
                    </button>
                  </div>
                  {prev && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
                      {changes.length ? changes.map((c) => <li key={c}>{c}</li>) : <li>Same as v{prev.version}</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}

/** Mismatches between the DPR's parts. A blocker needs fixing, or a note saying why it is right. */
function ConsistencyCard({ checks, content, onAck, onFix }: { checks: CrossCheck[]; content: DprContent; onAck: (acks: Record<string, Acknowledgement>) => void; onFix: (g: Gap) => void }) {
  const [noting, setNoting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const acks = content.acks ?? {};
  const open = openBlockers(checks, acks);
  return (
    <Card role="region" aria-labelledby="dpr-checks-title">
      <CardHeader id="dpr-checks-title" title="Consistency checks" subtitle="Capacity, voltage, transformers, section 01 facts, BCR, load data and the workbook's own abstract totals" />
      {!checks.length ? (
        <p role="status" className="flex items-center gap-2 px-4 py-3 text-[13px] text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Everything agrees.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 text-[13px]">
          {checks.map((c) => {
            const ack = acks[c.id]?.message === c.message ? acks[c.id] : undefined;
            const blocking = open.includes(c);
            return (
              <li key={c.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-start gap-2">
                  <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${blocking ? 'text-rose-600' : 'text-amber-500'}`} aria-hidden />
                  <span className="min-w-[14rem] flex-1 text-gray-900">
                    <span className="sr-only">{blocking ? 'Blocker: ' : c.severity === 'blocker' ? 'Accepted: ' : 'Warning: '}</span>
                    {c.message}
                  </span>
                  <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => onFix(gapOfCheck(c))}>
                    Fix <ArrowRight className="h-3 w-3" aria-hidden />
                  </button>
                  {blocking && noting !== c.id && (
                    <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => (setNoting(c.id), setNote(''))}>
                      It is correct…
                    </button>
                  )}
                  {ack && (
                    <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => onAck(Object.fromEntries(Object.entries(acks).filter(([k]) => k !== c.id)))}>
                      Undo
                    </button>
                  )}
                </div>
                {!ack && <p className="ml-6 mt-0.5 text-xs text-gray-500">{c.how}</p>}
                {ack && <p className="ml-6 mt-0.5 text-xs text-gray-500">Accepted: {ack.note}</p>}
                {noting === c.id && (
                  <div className="ml-6 mt-1.5 flex flex-wrap gap-2">
                    <input aria-label="Why this is correct" className="input h-8 min-w-[16rem] flex-1 text-xs" placeholder="e.g. replacement: 2×8 MVA out, 2×20 MVA in" value={note} onChange={(ev) => setNote(ev.target.value)} />
                    <button
                      type="button"
                      className="btn-secondary h-8"
                      disabled={!note.trim()}
                      onClick={() => {
                        onAck({ ...acks, [c.id]: { message: c.message, note: note.trim() } });
                        setNoting(null);
                      }}
                    >
                      Accept
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Step 6: one place that says what is missing and generates the full DPR. */
export function GenerateDprPanel({
  dpr,
  estimate,
  documents,
  onGoTo,
  onFix,
  onChange,
  checks = [],
  checklist: given,
}: Props & { onGoTo: (step: StepKey) => void; onFix?: (g: Gap) => void; checks?: CrossCheck[]; checklist?: Gap[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const content = contentOf(dpr, estimate);
  const checklist = given ?? dprChecklist(estimate, documents, content, checks);
  const fix = onFix ?? ((g: Gap) => onGoTo(g.step));
  const gaps = checklist.map((g) => g.label);
  const parts = outline(estimate, documents, content, checklist);

  const [versions, setVersions] = useState(() => listVersions(dpr.id));
  const last = versions.at(-1);
  const pending = last ? diffVersions(last, snapshot(dpr, estimate, documents, gaps, versions)) : [];

  const openPrint = () => {
    const v = snapshot(dpr, estimate, documents, gaps, versions);
    if (!openSheet(dprHtml(sheetSet(dpr, estimate)))) {
      toast({ title: 'The page was blocked', description: 'Allow pop-ups for this site and try again.', tone: 'error' });
      return;
    }
    setVersions(saveVersion(v));
  };

  const download = async () => {
    setBusy(true);
    try {
      const v = snapshot(dpr, estimate, documents, gaps, versions);
      await downloadDprDocx({ dpr, estimate, documents, content, gaps, version: v.version });
      setVersions(saveVersion(v));
      toast(gaps.length ? { title: `Draft DPR v${v.version} generated`, description: `${gaps.length} items still missing; the cover is marked DRAFT.`, tone: 'info' } : { title: `Full DPR v${v.version} generated`, description: dpr.id });
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
          subtitle="Cover, contents, project at a glance, project report, PERT chart and BCR, page for page as the Thyavanige DPR. Opens in a new tab to print or save as PDF (Chrome or Edge)."
          action={
            <span className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={openPrint}>
                <Printer className="h-3.5 w-3.5" aria-hidden />
                Open DPR to print
              </button>
              <button type="button" className="btn-secondary" onClick={download} disabled={busy} title="An editable Word copy of the text pages and tables">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {busy ? 'Preparing…' : 'Word file'}
              </button>
            </span>
          }
        />
        <div className="px-4 py-3 text-[13px]">
          {gaps.length ? (
            <div role="status" className="flex flex-wrap items-start gap-x-3 gap-y-2 text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="min-w-[16rem] flex-1">
                {gaps.length} {gaps.length === 1 ? 'thing is' : 'things are'} still missing; they print as blanks or placeholder text, and the Word file is marked DRAFT. “Fix” takes you to each one in turn and says what to do.
              </p>
              <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => fix(checklist[0]!)}>
                Fix the first one <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Everything is in place. The DPR is ready for submission.
            </p>
          )}
        </div>
      </Card>

      {gaps.length > 0 && (
        <Card role="region" aria-labelledby="dpr-missing-title">
          <CardHeader id="dpr-missing-title" title="Still missing" subtitle="Grouped by step. Fix opens the exact field and says what to do." />
          <div className="divide-y divide-gray-100">
            {STEPS.filter((s) => checklist.some((g) => g.step === s.key)).map((s) => {
              const items = checklist.filter((g) => g.step === s.key);
              return (
                <div key={s.key} className="px-4 py-2.5 text-[13px]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-gray-900">{s.label}</span>
                    <span className="text-xs text-gray-500">{items.length}</span>
                  </div>
                  <ul className="grid gap-x-6 text-xs text-gray-700 sm:grid-cols-2">
                    {items.map((g) => {
                      const what = g.label.replace(/^(text|document|PERT|mismatch): /, '');
                      return (
                        <li key={g.id} className="flex min-h-8 items-center gap-2">
                          <Circle className="h-2 w-2 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                          <span className="min-w-0 flex-1">{what}</span>
                          <button type="button" aria-label={`Fix ${what}`} className="btn-ghost h-7 shrink-0 px-2 text-xs" onClick={() => fix(g)}>
                            Fix <ArrowRight className="h-3 w-3" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ConsistencyCard checks={checks} content={content} onAck={(acks) => onChange({ ...estimate, document: { ...content, acks } })} onFix={fix} />

      <PrintSheetsCard dpr={dpr} estimate={estimate} />

      <EstimatePdfCard dpr={dpr} estimate={estimate} open={pdfOpen} onOpenChange={setPdfOpen} />

      <Card role="region" aria-labelledby="dpr-outline-title">
        <CardHeader id="dpr-outline-title" title="What goes into the DPR" subtitle="Annexures 5, 7, 8 and 9 are your attached files; the final DPR below puts them in place" />
        <ol className="divide-y divide-gray-100">
          {parts.map((p) => (
            <li key={p.title} className="flex min-h-11 items-center gap-x-3 px-4 py-2 text-[13px]">
              {p.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Ready" /> : <Circle className="h-4 w-4 shrink-0 text-amber-500" aria-label="Not ready" />}
              <span className="num w-6 shrink-0 text-gray-400">{p.no}</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-gray-900">{p.title}</span>
                <span className="text-xs text-gray-500">{p.note}</span>
              </span>
              {p.no === '3.' && (
                <button type="button" className="btn-secondary h-7 shrink-0 px-2 text-xs" onClick={() => setPdfOpen(true)}>
                  <FileDown className="h-3 w-3" aria-hidden />
                  PDF
                </button>
              )}
              {p.ok ? (
                <span className="w-12 shrink-0" aria-hidden />
              ) : (
                <button type="button" aria-label={`Fix ${p.title}`} className="btn-ghost h-7 w-12 shrink-0 px-2 text-xs" onClick={() => (p.gap ? fix(p.gap) : onGoTo(p.step))}>
                  Fix <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <PdfPackCard dpr={dpr} estimate={estimate} documents={documents} />

      <VersionsCard versions={versions} pending={pending} />


    </div>
  );
}
