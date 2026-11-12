import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, RotateCcw, Search, TriangleAlert, Undo2, Upload } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { blobBytes } from '@/lib/fileStore';
import { formatNumber } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { catalogName, loadBuiltInCatalog, restoreBuiltInCatalog, saveCatalog } from './catalog';
import { adoptIds, catalogToWorkbook, diffCatalogs, readCatalogFile, type CatalogDiff } from './catalogFile';
import { getSavedCatalog, type ItemEdit, type SavedCatalog } from './catalogStore';
import type { CatalogChildRate, CatalogItem, RateCatalog } from './types';

const PAGE_SIZE = 40;
const rs = (n: number | null) => (n == null ? '—' : formatNumber(Math.round(n * 100) / 100));
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** A rate field that saves when the user leaves it or presses Enter, not on every keystroke. */
function RateInput({ value, label, onCommit, edited }: { value: number | null; label: string; onCommit: (n: number) => void; edited?: boolean }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  const commit = () => {
    setFocused(false);
    const n = Number(text.replace(/[,\s₹]/g, ''));
    if (text.trim() === '' || !Number.isFinite(n) || n < 0) return setText(value == null ? '' : String(value));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      // Shown in lakh/crore grouping; the plain number while it is being typed.
      value={focused || text === '' || !Number.isFinite(Number(text)) ? text : rs(Number(text))}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`num h-7 w-28 rounded border px-1.5 text-right text-[13px] text-gray-900 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/15 ${
        edited ? 'border-amber-300 bg-amber-50' : 'border-transparent bg-transparent hover:border-gray-200'
      }`}
    />
  );
}

const ratesOf = (i: CatalogItem): ItemEdit['was'] => ({ rate: i.rate, labour: i.labour.map((c) => c.rate), tc: i.tc.map((c) => c.rate) });
const sameRates = (a: ItemEdit['was'], b: ItemEdit['was']) => a.rate === b.rate && a.labour.join() === b.labour.join() && a.tc.join() === b.tc.join();

function ChildRates({ item, kind, label, edit, onChange }: { item: CatalogItem; kind: 'labour' | 'tc'; label: string; edit?: ItemEdit; onChange: (n: number, k: number) => void }) {
  const list: CatalogChildRate[] = item[kind];
  if (!list.length) return <span className="text-gray-400">—</span>;
  return (
    <ul className="space-y-1">
      {list.map((c, k) => (
        <li key={k} className="flex items-start justify-end gap-1.5">
          <span className="line-clamp-2 min-w-0 flex-1 pt-1 text-xs text-gray-500" title={`${c.text}${c.sr ? ` · ${c.sr}` : ''}`}>
            {c.text}
          </span>
          <span className="flex flex-col items-end">
            <RateInput value={c.rate} label={`${label} rate ${k + 1}, ${item.code || item.item.slice(0, 30)}`} onCommit={(n) => onChange(n, k)} edited={edit != null && edit.was[kind][k] !== c.rate} />
            <span className="text-[11px] text-gray-500">per {c.unit || 'unit'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The rate catalog every BOQ price is matched against. The user keeps it up to date here when rates
 * change (each quarter or month): upload a new catalog workbook, or change a rate by hand. It is saved in
 * this browser; until then the catalog shipped with the app (rate_catalog 76) is used.
 */
export function RateCatalogPage() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedCatalog | null>(null);
  const [builtIn, setBuiltIn] = useState<RateCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ catalog: RateCatalog; fileName: string; diff: CatalogDiff } | null>(null);
  const [reading, setReading] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([getSavedCatalog().catch(() => null), loadBuiltInCatalog()])
      .then(([s, b]) => {
        if (!live) return;
        setSaved(s);
        setBuiltIn(b);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const catalog = saved?.catalog ?? builtIn;
  const edits = useMemo(() => saved?.edits ?? {}, [saved]);
  const sheets = useMemo(() => [...new Set((catalog?.items ?? []).map((i) => i.sheet))], [catalog]);
  const priced = useMemo(() => (catalog?.items ?? []).filter((i) => i.rate !== null && i.rate > 0).length, [catalog]);
  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (catalog?.items ?? []).filter((i) => {
      if (sheet && i.sheet !== sheet) return false;
      if (onlyEdited && !edits[i.id]) return false;
      if (!words.length) return true;
      const code = i.code.toLowerCase();
      const text = `${i.item} ${i.context}`.toLowerCase();
      return words.every((w) => code === w || code.startsWith(`${w}.`) || text.includes(w));
    });
  }, [catalog, query, sheet, onlyEdited, edits]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const keep = async (next: SavedCatalog, done: string) => {
    setSaved(next);
    const ok = await saveCatalog(next);
    toast(ok ? { title: done, tone: 'success' } : { title: done, description: 'This browser would not keep it, so it lasts until the page is closed.', tone: 'error' });
  };

  /** Changes one rate of an item: its supply rate, or erection/T&C rate number k. */
  const changeRate = (item: CatalogItem, kind: 'rate' | 'labour' | 'tc', n: number, k = 0) => {
    if (!catalog) return;
    const next: CatalogItem =
      kind === 'rate' ? { ...item, rate: n } : { ...item, [kind]: item[kind].map((c, j) => (j === k ? { ...c, rate: n } : c)) };
    const was = edits[item.id]?.was ?? ratesOf(item);
    const nextEdits = { ...edits };
    if (sameRates(was, ratesOf(next))) delete nextEdits[item.id];
    else nextEdits[item.id] = { at: new Date().toISOString(), was };
    void keep(
      {
        catalog: { ...catalog, items: catalog.items.map((i) => (i.id === item.id ? next : i)) },
        savedAt: saved?.savedAt ?? new Date().toISOString(),
        fileName: saved?.fileName ?? '',
        edits: nextEdits,
      },
      `Rate saved for ${item.code || item.item.slice(0, 40)}`,
    );
  };

  const undo = (item: CatalogItem) => {
    const e = edits[item.id];
    if (!catalog || !saved || !e) return;
    const back: CatalogItem = { ...item, rate: e.was.rate, labour: item.labour.map((c, j) => ({ ...c, rate: e.was.labour[j] ?? c.rate })), tc: item.tc.map((c, j) => ({ ...c, rate: e.was.tc[j] ?? c.rate })) };
    const nextEdits = { ...edits };
    delete nextEdits[item.id];
    void keep({ ...saved, catalog: { ...catalog, items: catalog.items.map((i) => (i.id === item.id ? back : i)) }, edits: nextEdits }, `Rates of ${item.code || 'the item'} put back`);
  };

  const pick = async (file: File | undefined) => {
    if (!file || !catalog) return;
    setReading(true);
    try {
      const read = adoptIds(catalog, await readCatalogFile(await blobBytes(file), file.name));
      setPending({ catalog: read, fileName: file.name, diff: diffCatalogs(catalog, read) });
    } catch (e) {
      toast({ title: 'Catalog not read', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const acceptPending = async () => {
    if (!pending) return;
    await keep({ catalog: pending.catalog, savedAt: new Date().toISOString(), fileName: pending.fileName, edits: {} }, `Now using ${catalogName(pending.catalog)}`);
    setPending(null);
    setPage(1);
  };

  const restore = async () => {
    await restoreBuiltInCatalog();
    setSaved(null);
    setConfirmRestore(false);
    toast({ title: `Back to the built-in catalog (${catalogName(builtIn)})`, tone: 'success' });
  };

  const download = async () => {
    if (!catalog) return;
    const data = await catalogToWorkbook(catalog);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.xlsx$/i.test(catalog.source) ? catalog.source : `${catalogName(catalog)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const editedCount = Object.keys(edits).length;
  const facts = [
    { label: 'Catalog in use', value: catalog ? catalogName(catalog) : '…' },
    { label: 'Items with a rate', value: catalog ? formatNumber(priced) : '…' },
    { label: 'Source', value: saved ? (saved.fileName ? `Uploaded ${when(saved.savedAt)}` : 'Built-in, edited here') : 'Built-in (shipped with the app)' },
    { label: 'Rates changed by hand', value: formatNumber(editedCount) },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Rate Catalog"
        description="Every BOQ rate is matched against this catalog. When the SoR rates change, upload the new catalog or change a rate here; the BOQ review and “Price from the rate catalog” use it straight away."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => void download()} disabled={!catalog}>
              <Download className="h-4 w-4" aria-hidden />
              Download Excel
            </button>
            <button type="button" className="btn-primary" onClick={() => fileInput.current?.click()} disabled={!catalog || reading}>
              <Upload className="h-4 w-4" aria-hidden />
              {reading ? 'Reading…' : 'Upload new catalog'}
            </button>
            <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.xls" aria-label="Rate catalog workbook" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </>
        }
      />

      <section aria-label="Catalog summary" className="mb-4">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="bg-white px-4 py-3">
              <dt className="text-xs text-gray-500">{f.label}</dt>
              <dd className="mt-1 truncate text-[15px] font-semibold tracking-tight text-gray-900">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Kept in this browser. To share an update, download the Excel file and upload it on the other computer.</span>
          {saved &&
            (confirmRestore ? (
              <span className="flex items-center gap-2 text-gray-700">
                Drop the uploaded catalog and every rate changed by hand?
                <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => void restore()}>
                  Yes, use the built-in catalog
                </button>
                <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => setConfirmRestore(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="inline-flex items-center gap-1 text-gray-700 underline-offset-2 hover:underline" onClick={() => setConfirmRestore(true)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Go back to the built-in catalog
              </button>
            ))}
        </div>
      </section>

      {pending && (
        <Card role="region" aria-labelledby="catalog-upload-title" className="mb-4 border-accent-500/40">
          <CardHeader
            id="catalog-upload-title"
            title={`New catalog: ${pending.fileName}`}
            subtitle={`${formatNumber(pending.catalog.items.length)} items read from ${new Set(pending.catalog.items.map((i) => i.sheet)).size} sheets. Nothing changes until you use it.`}
          />
          <div className="space-y-2 px-4 py-3 text-[13px] text-gray-700">
            <p>
              Compared with {catalogName(catalog)}: <strong className="text-gray-900">{pending.diff.changed.length}</strong> supply {pending.diff.changed.length === 1 ? 'rate changes' : 'rates change'},{' '}
              <strong className="text-gray-900">{pending.diff.added}</strong> {pending.diff.added === 1 ? 'item is' : 'items are'} new and{' '}
              <strong className="text-gray-900">{pending.diff.removed}</strong> {pending.diff.removed === 1 ? 'is' : 'are'} no longer in it.
              {editedCount > 0 && ` The ${editedCount} ${editedCount === 1 ? 'rate' : 'rates'} changed by hand are replaced by the file.`}
            </p>
            {pending.diff.changed.length > 0 && (
              <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                {pending.diff.changed.slice(0, 50).map(({ item, was }) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5">
                    <span className="num w-16 text-gray-500">{item.code}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-900">{item.item}</span>
                    <span className="num text-gray-500">{rs(was)}</span>
                    <span className="num font-medium text-gray-900">→ {rs(item.rate)}</span>
                  </li>
                ))}
                {pending.diff.changed.length > 50 && <li className="px-3 py-1.5 text-gray-500">…and {pending.diff.changed.length - 50} more.</li>}
              </ul>
            )}
            {pending.diff.removed > pending.catalog.items.length / 2 && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Most items of the current catalog are not in this file. Check it is the full catalog, not one sheet of it.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-primary" onClick={() => void acceptPending()}>
                Use this catalog
              </button>
              <button type="button" className="btn-ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card role="region" aria-labelledby="catalog-items-title">
        <CardHeader
          id="catalog-items-title"
          title="Items and rates"
          subtitle="Click a rate to change it; it is saved when you leave the field. Changed rates are shown in amber and can be put back."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <span className="sr-only">Search the catalog</span>
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => (setQuery(e.target.value), setPage(1))}
                  placeholder="Code or words, e.g. 1.10"
                  className="input h-8 w-64 pl-8 text-[13px]"
                />
              </label>
              <select aria-label="Sheet" value={sheet} onChange={(e) => (setSheet(e.target.value), setPage(1))} className="input h-8 w-auto text-[13px]">
                <option value="">All sheets</option>
                {sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[13px] text-gray-700">
                <input type="checkbox" checked={onlyEdited} onChange={(e) => (setOnlyEdited(e.target.checked), setPage(1))} />
                Only changed rates
              </label>
            </div>
          }
        />
        {failed ? (
          <EmptyState icon={TriangleAlert} title="The rate catalog could not be loaded" hint="Reload the page to try again." />
        ) : !catalog ? (
          <p className="px-4 py-6 text-[13px] text-gray-500">Loading the rate catalog…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={BookOpen} title="No items match" hint={onlyEdited ? 'No rate has been changed by hand.' : 'Try fewer words, or a code like 1.10.'} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <th scope="col" className="w-20 px-2 py-2 pl-4 font-medium">
                    Code
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Item
                  </th>
                  <th scope="col" className="w-16 px-2 py-2 font-medium">
                    Unit
                  </th>
                  <th scope="col" className="w-32 px-2 py-2 text-right font-medium">
                    Supply rate
                  </th>
                  <th scope="col" className="w-64 px-2 py-2 text-right font-medium">
                    Erection rates
                  </th>
                  <th scope="col" className="w-64 px-2 py-2 text-right font-medium">
                    T&amp;C rates
                  </th>
                  <th scope="col" className="w-24 px-2 py-2 pr-4 font-medium">
                    SR ref
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const e = edits[i.id];
                  return (
                    <tr key={i.id} className={`border-b border-gray-100 align-top ${e ? 'bg-amber-50/40' : ''}`}>
                      <td className="num px-2 py-2 pl-4 text-gray-900">{i.code || '—'}</td>
                      <td className="px-2 py-2">
                        <span className="block text-xs text-gray-500">
                          {i.sheet}
                          {i.context ? ` · ${i.context}` : ''}
                        </span>
                        <span className="line-clamp-3 text-gray-900" title={i.item}>
                          {i.item}
                        </span>
                        {e && (
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                            Changed {when(e.at)}; was {rs(e.was.rate)}
                            <button type="button" className="inline-flex items-center gap-1 text-gray-700 underline-offset-2 hover:underline" onClick={() => undo(i)} aria-label={`Put back the rates of ${i.code || i.item.slice(0, 30)}`}>
                              <Undo2 className="h-3.5 w-3.5" aria-hidden />
                              Put back
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-700">{i.unit}</td>
                      <td className="px-2 py-1.5 text-right">
                        <RateInput value={i.rate} label={`Supply rate, ${i.code || i.item.slice(0, 30)}`} onCommit={(n) => changeRate(i, 'rate', n)} edited={e != null && e.was.rate !== i.rate} />
                      </td>
                      <td className="px-2 py-1.5">
                        <ChildRates item={i} kind="labour" label="Erection" edit={e} onChange={(n, k) => changeRate(i, 'labour', n, k)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <ChildRates item={i} kind="tc" label="T&C" edit={e} onChange={(n, k) => changeRate(i, 'tc', n, k)} />
                      </td>
                      <td className="px-2 py-2 pr-4 text-xs text-gray-500">{i.sr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={current} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      </Card>
    </div>
  );
}
