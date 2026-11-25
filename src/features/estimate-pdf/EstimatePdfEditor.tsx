import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useToast } from '@/lib/toast';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { DEFAULT_PDF_SETTINGS, PAPER, SHEET_TITLES, defaultOrientation, heading, projectLine, withDefaults, type BorderStyle, type Orientation, type Paper, type PdfSettings, type SheetSettings } from './format';
import { approxMeasure, columnWidths, layout, orderSheets, pageKey, sheetSettings, type Measure, type Page } from './layout';
import { FONT_FILES, PREVIEW_FONT, downloadPdf, loadFonts } from './renderPdf';
import { sheetsFromFile, sheetsFromWorkbook, type PdfSheet } from './sheets';
import { settingsKey } from './estimatePdfBytes';

/** A row (with the clicked cell's column) or a column heading. */
type Selection = { sheet: string; kind: 'row' | 'col'; index: number; col?: number } | null;

const CELL_EDITOR = 'pdf-cell-text';
const focusCellEditor = () => requestAnimationFrame(() => document.getElementById(CELL_EDITOR)?.focus());


/** The preview draws with the same font files as the PDF. */
const fontUrl = (f: string) => `${import.meta.env.BASE_URL ?? '/'}${f}`;
const PREVIEW_FONT_FACES = `@font-face{font-family:'${PREVIEW_FONT}';src:url('${fontUrl(FONT_FILES.regular)}') format('truetype');font-weight:400}
@font-face{font-family:'${PREVIEW_FONT}';src:url('${fontUrl(FONT_FILES.bold)}') format('truetype');font-weight:700}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-2 border-b border-gray-200 px-4 py-3">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      {children}
    </fieldset>
  );
}

function Num({ label, value, onChange, step = 0.5, min = 0, max = 100 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
      <span>{label}</span>
      <input
        type="number"
        className="input h-7 w-20 text-right"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''}
        step={step}
        min={min}
        max={max}
        onChange={(ev) => {
          const v = Number(ev.target.value);
          if (ev.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-gray-700">
      <input type="checkbox" checked={checked} onChange={(ev) => onChange(ev.target.checked)} />
      {label}
    </label>
  );
}

/** One page drawn as SVG from the same operations the PDF uses, with handles to resize rows and columns. */
function PageView({
  page,
  zoom,
  selection,
  onSelect,
  onDragCol,
  onDragRow,
}: {
  page: Page;
  zoom: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onDragCol: (sheet: string, boundary: number, start: number, dx: number) => void;
  onDragRow: (sheet: string, index: number, startHeight: number, dy: number) => void;
}) {
  const t = page.table;
  // A drag ends with a click on the page, which must not clear the selection.
  const dragged = useRef(false);
  const drag = (ev: React.PointerEvent, move: (d: { dx: number; dy: number }) => void) => {
    ev.preventDefault();
    ev.stopPropagation();
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    dragged.current = false;
    const onMove = (m: PointerEvent) => {
      dragged.current = true;
      move({ dx: (m.clientX - x0) / zoom, dy: (m.clientY - y0) / zoom });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const sel = selection?.sheet === page.sheet ? selection : null;
  /** The column under the pointer, from its position on the page. */
  const colAt = (ev: React.MouseEvent) => {
    const box = (ev.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const x = (ev.clientX - box.left) / zoom;
    const i = t!.xs.findIndex((edge, k) => k < t!.xs.length - 1 && x >= edge && x < t!.xs[k + 1]!);
    return Math.max(0, i);
  };
  return (
    <svg
      width={page.w * zoom}
      height={page.h * zoom}
      viewBox={`0 0 ${page.w} ${page.h}`}
      className="block bg-white shadow-md ring-1 ring-gray-200"
      role="img"
      aria-label={`${page.sheet}, page ${page.sheetPage}`}
      onClick={() => {
        if (!dragged.current) onSelect(null);
        dragged.current = false;
      }}
    >
      {page.ops.map((op, i) =>
        op.kind === 'rect' ? (
          <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={`rgb(${op.grey * 255},${op.grey * 255},${op.grey * 255})`} />
        ) : null,
      )}
      {t && sel?.kind === 'row' && t.rows.filter((r) => r.index === sel.index).map((r) => <rect key="sel" x={t.xs[0]} y={r.y} width={t.xs.at(-1)! - t.xs[0]!} height={r.h} fill="rgba(59,130,246,0.15)" />)}
      {t && sel?.kind === 'col' && t.rows.length > 0 && (
        <rect x={t.xs[sel.index]} y={t.rows[0]!.y} width={t.xs[sel.index + 1]! - t.xs[sel.index]!} height={t.rows.at(-1)!.y + t.rows.at(-1)!.h - t.rows[0]!.y} fill="rgba(59,130,246,0.12)" />
      )}
      {t && sel?.kind === 'row' && sel.col !== undefined &&
        t.rows.filter((r) => r.index === sel.index).map((r) => (
          <rect key="cell" x={t.xs[sel.col!]} y={r.y} width={t.xs[sel.col! + 1]! - t.xs[sel.col!]!} height={r.h} fill="rgba(59,130,246,0.18)" stroke="rgb(37,99,235)" strokeWidth={1} />
        ))}
      {page.ops.map((op, i) =>
        op.kind === 'line' ? (
          <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke="#000" strokeWidth={op.width} />
        ) : op.kind === 'text' ? (
          <text key={i} x={op.x} y={op.y} fontSize={op.size} fontWeight={op.bold ? 700 : 400} fontFamily={`'${PREVIEW_FONT}', 'Bookman Old Style', serif`} xmlSpace="preserve" fill="#000">
            {op.text}
          </text>
        ) : null,
      )}
      {t && (
        <g>
          {t.rows.map((r) =>
            r.index === -1 ? (
              t.xs.slice(0, -1).map((x, c) => (
                <rect
                  key={`h${c}`}
                  x={x}
                  y={r.y}
                  width={t.xs[c + 1]! - x}
                  height={r.h}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect({ sheet: page.sheet, kind: 'col', index: c });
                  }}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    onSelect({ sheet: page.sheet, kind: 'col', index: c });
                    focusCellEditor();
                  }}
                >
                  <title>Click to select this column, double-click to edit the heading</title>
                </rect>
              ))
            ) : (
              <rect
                key={`r${r.index}`}
                x={t.xs[0]}
                y={r.y}
                width={t.xs.at(-1)! - t.xs[0]!}
                height={r.h}
                fill="transparent"
                className="cursor-pointer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect({ sheet: page.sheet, kind: 'row', index: r.index, col: colAt(ev) });
                }}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  onSelect({ sheet: page.sheet, kind: 'row', index: r.index, col: colAt(ev) });
                  focusCellEditor();
                }}
              >
                <title>Click to select, double-click to edit the text</title>
              </rect>
            ),
          )}
          {t.rows.map((r) => (
            <rect
              key={`rh${r.index}`}
              x={t.xs[0]}
              y={r.y + r.h - 2}
              width={t.xs.at(-1)! - t.xs[0]!}
              height={4}
              fill="transparent"
              style={{ cursor: 'row-resize' }}
              onClick={(ev) => ev.stopPropagation()}
              onPointerDown={(ev) => drag(ev, ({ dy }) => onDragRow(page.sheet, r.index, r.h, dy))}
            >
              <title>Drag to change the row height</title>
            </rect>
          ))}
          {t.rows.length > 0 &&
            t.xs.slice(1, -1).map((x, i) => (
              <rect
                key={`c${i}`}
                x={x - 2}
                y={t.rows[0]!.y}
                width={4}
                height={t.rows.at(-1)!.y + t.rows.at(-1)!.h - t.rows[0]!.y}
                fill="transparent"
                style={{ cursor: 'col-resize' }}
                onClick={(ev) => ev.stopPropagation()}
              onPointerDown={(ev) => drag(ev, ({ dx }) => onDragCol(page.sheet, i, x, dx))}
              >
                <title>Drag to change the column width</title>
              </rect>
            ))}
        </g>
      )}
    </svg>
  );
}

/** Full-screen editor: the abstract and estimate sheets as print pages, with the layout controls beside them. */
export function EstimatePdfEditor({ dpr, estimate, onClose }: { dpr: DprRow; estimate: Estimate; onClose: () => void }) {
  const toast = useToast();
  const [stored, setStored] = usePersistentState<Partial<PdfSettings>>(settingsKey(dpr.id), DEFAULT_PDF_SETTINGS);
  const settings = useMemo(() => withDefaults(stored), [stored]);
  const set = (patch: Partial<PdfSettings>) => setStored((cur) => ({ ...withDefaults(cur), ...patch }));
  const setSheet = (key: string, patch: Partial<SheetSettings>) =>
    setStored((cur) => {
      const s = withDefaults(cur);
      return { ...s, sheets: { ...s.sheets, [key]: { ...s.sheets[key], ...patch } } };
    });

  const [file, setFile] = useState<{ name: string; sheets: PdfSheet[] } | null>(null);
  const [fromEstimate, setFromEstimate] = useState<PdfSheet[] | null>(null);
  const [measure, setMeasure] = useState<Measure>(() => approxMeasure);
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    loadFonts()
      .then((m) => live && setMeasure(() => m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    buildEstimateWorkbook(dpr, estimate)
      .then((wb) => live && setFromEstimate(sheetsFromWorkbook(wb)))
      .catch(() => live && setFromEstimate([]));
    return () => {
      live = false;
    };
  }, [dpr, estimate]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const sheets = file?.sheets ?? fromEstimate;
  const orderedSheets = useMemo(() => orderSheets(sheets ?? [], settings.sheetOrder), [sheets, settings.sheetOrder]);
  // Moving a sheet starts the page order afresh, so the sheet's pages move with it.
  const moveSheet = (k: number, by: number) => {
    const keys = orderedSheets.map((x) => x.key);
    [keys[k], keys[k + by]] = [keys[k + by]!, keys[k]!];
    set({ sheetOrder: keys, pageOrder: undefined });
  };
  const movePage = (i: number, by: number) => {
    const keys = pages.map(pageKey);
    [keys[i], keys[i + by]] = [keys[i + by]!, keys[i]!];
    set({ pageOrder: keys });
  };
  const pages = useMemo(() => (sheets ? layout(sheets, settings, measure) : []), [sheets, settings, measure]);
  const selSheet = sheets?.find((s) => s.key === selection?.sheet);
  const tableWidthOf = (sheet: PdfSheet) => {
    const page = pages.find((p) => p.sheet === sheet.key);
    return page?.table ? page.table.xs.at(-1)! - page.table.xs[0]! : 500;
  };
  const widthsOf = (sheet: PdfSheet) => columnWidths(sheet, sheetSettings(settings, sheet.key), tableWidthOf(sheet));

  const dragBase = useRef<{ key: string; widths: number[] } | null>(null);
  const rowBase = useRef<{ key: string; h: number } | null>(null);
  const dragCol = (key: string, boundary: number, _start: number, dx: number) => {
    const sheet = sheets?.find((s) => s.key === key);
    if (!sheet) return;
    // Widths are taken once at the start of a drag, so the change follows the pointer.
    const base = dragBase.current?.key === `${key}:${boundary}` ? dragBase.current.widths : widthsOf(sheet);
    dragBase.current = { key: `${key}:${boundary}`, widths: base };
    const w = [...base];
    const min = 14;
    const d = Math.max(min - w[boundary]!, Math.min(w[boundary + 1]! - min, dx));
    w[boundary] = w[boundary]! + d;
    w[boundary + 1] = w[boundary + 1]! - d;
    setSheet(key, { colWeights: w });
  };
  useEffect(() => {
    const clear = () => {
      dragBase.current = null;
      rowBase.current = null;
    };
    window.addEventListener('pointerup', clear);
    return () => window.removeEventListener('pointerup', clear);
  }, []);
  const dragRow = (key: string, index: number, startHeight: number, dy: number) => {
    const id = `${key}:${index}`;
    if (rowBase.current?.key !== id) rowBase.current = { key: id, h: startHeight };
    const cur = sheetSettings(settings, key);
    setSheet(key, { rowHeights: { ...cur.rowHeights, [String(index)]: Math.max(6, rowBase.current.h + dy) } });
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const list = await sheetsFromFile(f);
      if (!list.length) throw new Error('no sheets');
      setFile({ name: f.name, sheets: list });
      setSelection(null);
      toast({ title: `Using ${f.name}`, description: `${list.length} abstract and estimate sheets read.` });
    } catch {
      toast({ title: 'Could not read that file', description: 'Choose an .xlsx downloaded from this app with "Download Excel" (it may have been edited in Excel).', tone: 'error' });
    }
  };

  const download = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      await downloadPdf(pages, `Abstract_Estimate_${dpr.id.replace(/\W+/g, '-')}_${new Date().toISOString().slice(0, 10)}.pdf`, `Abstract & Estimate · ${dpr.project}`);
    } catch {
      toast({ title: 'PDF not created', description: 'Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const selSettings = selSheet ? sheetSettings(settings, selSheet.key) : null;
  const cellKey = !selSheet || !selection ? null : selection.kind === 'col' ? `-1:${selection.index}` : selection.col !== undefined ? `${selection.index}:${selection.col}` : null;
  const originalText = !selSheet || !selection ? '' : selection.kind === 'col' ? heading(selSheet.columns[selection.index]?.header ?? '').text : (selSheet.rows[selection.index]?.cells[selection.col ?? 0] ?? '');
  const selRow = selection?.kind === 'row' && selSheet ? selSheet.rows[selection.index] : null;
  const selPage = selection ? pages.find((p) => p.sheet === selection.sheet && p.table?.rows.some((r) => r.index === (selection.kind === 'row' ? selection.index : -1))) : undefined;
  const selRowHeight = selection?.kind === 'row' ? selPage?.table?.rows.find((r) => r.index === selection.index)?.h : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100" role="dialog" aria-modal="true" aria-labelledby="pdf-editor-title">
      <style>{PREVIEW_FONT_FACES}</style>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 id="pdf-editor-title" className="text-[13px] font-semibold text-gray-900">
            Abstract &amp; Estimate PDF
          </h2>
          <p className="truncate text-xs text-gray-500">
            {file ? `From ${file.name}` : 'From this DPR’s estimate, as in the Excel download'} · {pages.length} {pages.length === 1 ? 'page' : 'pages'} · {PAPER[settings.paper]?.label ?? 'Letter'}
          </p>
        </div>
        <div className="flex items-center gap-1" aria-label="Zoom">
          <button type="button" className="btn-ghost h-8 w-8 px-0" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}>
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="num w-12 text-center text-xs text-gray-600">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn-ghost h-8 w-8 px-0" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={download} disabled={busy || !pages.length}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Preparing…' : 'Download PDF'}
        </button>
        <button type="button" className="btn-ghost h-8 w-8 px-0" aria-label="Close the PDF editor" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="max-h-[42vh] shrink-0 overflow-y-auto overflow-x-hidden border-b border-gray-200 bg-white lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r" aria-label="Layout settings">
          <Section title="Source">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={file ? 'btn-secondary h-7 px-2 text-xs' : 'btn-primary h-7 px-2 text-xs'} onClick={() => setFile(null)}>
                This estimate
              </button>
              <button type="button" className={file ? 'btn-primary h-7 px-2 text-xs' : 'btn-secondary h-7 px-2 text-xs'} onClick={() => fileInput.current?.click()}>
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                {file ? 'Another Excel…' : 'Exported Excel…'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label="Exported estimate Excel"
                onChange={(ev) => {
                  void pickFile(ev.target.files?.[0]);
                  ev.target.value = '';
                }}
              />
            </div>
            <p className="text-xs text-gray-500">Items with no quantity are left out and zero amounts print blank, as in the Excel.</p>
          </Section>

          <Section title="Sheets">
            {!sheets && <p className="text-xs text-gray-500">Reading the estimate…</p>}
            {sheets?.length === 0 && <p className="text-xs text-amber-800">The estimate has no items yet.</p>}
            {sheets && sheets.length > 1 && <p className="text-xs text-gray-500">Use the arrows to change the order of the sheets; each page in the preview also has its own arrows.</p>}
            {orderedSheets.map((sh, k) => {
              const ss = sheetSettings(settings, sh.key);
              return (
                <div key={sh.key} className="flex items-center gap-2 text-[13px]">
                  <span className="flex flex-col">
                    <button type="button" className="h-3.5 leading-none text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label={`Move ${sh.key} up`} disabled={k === 0} onClick={() => moveSheet(k, -1)}>
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button type="button" className="h-3.5 leading-none text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label={`Move ${sh.key} down`} disabled={k === orderedSheets.length - 1} onClick={() => moveSheet(k, 1)}>
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                  <input type="checkbox" aria-label={`Include ${sh.key}`} checked={ss.include !== false} onChange={(ev) => setSheet(sh.key, { include: ev.target.checked })} />
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-gray-800 hover:underline" onClick={() => setSelection({ sheet: sh.key, kind: 'row', index: 0 })}>
                    {sh.key}
                  </button>
                  <select
                    aria-label={`${sh.key} orientation`}
                    className="input h-7 w-28 text-xs"
                    value={ss.orientation ?? defaultOrientation(sh.columns.length)}
                    onChange={(ev) => setSheet(sh.key, { orientation: ev.target.value as Orientation })}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              );
            })}
          </Section>

          {selSheet && selSettings && (
            <Section title={`Selected: ${selSheet.key}`}>
              <label className="block text-[13px] text-gray-700">
                Sheet title
                <input className="input mt-1 w-full min-w-0" value={selSettings.title ?? SHEET_TITLES[selSheet.key] ?? selSheet.title} onChange={(ev) => setSheet(selSheet.key, { title: ev.target.value })} />
              </label>
              <label className="block text-[13px] text-gray-700">
                Project line
                <input className="input mt-1 w-full min-w-0" value={selSettings.note ?? projectLine(selSheet.notes[0] ?? '')} onChange={(ev) => setSheet(selSheet.key, { note: ev.target.value })} />
              </label>
              {cellKey && (
                <label className="block text-[13px] text-gray-700">
                  {selection?.kind === 'col' ? 'Heading text' : `Text in “${selSheet.columns[selection!.col!]?.header ?? ''}”`}
                  <textarea
                    id={CELL_EDITOR}
                    className="input mt-1 w-full min-w-0"
                    rows={3}
                    value={selSettings.cells?.[cellKey] ?? originalText}
                    onChange={(ev) => setSheet(selSheet.key, { cells: { ...selSettings.cells, [cellKey]: ev.target.value } })}
                  />
                  {selSettings.cells?.[cellKey] !== undefined && (
                    <button
                      type="button"
                      className="btn-ghost mt-1 h-7 px-2 text-xs"
                      onClick={() => {
                        const cells = { ...selSettings.cells };
                        delete cells[cellKey];
                        setSheet(selSheet.key, { cells });
                      }}
                    >
                      Put back “{originalText.slice(0, 24)}{originalText.length > 24 ? '…' : ''}”
                    </button>
                  )}
                </label>
              )}
              {selection?.kind === 'row' && selRow && (
                <>
                  <p className="truncate text-xs text-gray-500">Row {selection.index + 1}: {selRow.cells.filter(Boolean).slice(0, 2).join(' · ')}</p>
                  <Check
                    label="Bold"
                    checked={selSettings.bold?.[String(selection.index)] ?? selRow.bold}
                    onChange={(v) => setSheet(selSheet.key, { bold: { ...selSettings.bold, [String(selection.index)]: v } })}
                  />
                  <Num
                    label="Row height (pt)"
                    value={selRowHeight ?? settings.minRowHeight}
                    min={6}
                    max={300}
                    onChange={(v) => setSheet(selSheet.key, { rowHeights: { ...selSettings.rowHeights, [String(selection.index)]: v } })}
                  />
                  <button
                    type="button"
                    className="btn-ghost h-7 px-2 text-xs"
                    onClick={() => {
                      const k = String(selection.index);
                      const rowHeights = { ...selSettings.rowHeights };
                      const bold = { ...selSettings.bold };
                      delete rowHeights[k];
                      delete bold[k];
                      setSheet(selSheet.key, { rowHeights, bold });
                    }}
                  >
                    Reset this row
                  </button>
                </>
              )}
              {selection?.kind === 'col' && (
                <>
                  <p className="truncate text-xs text-gray-500">Column {selection.index + 1}: {selSheet.columns[selection.index]?.header}</p>
                  <Num
                    label="Width (pt)"
                    value={widthsOf(selSheet)[selection.index] ?? 0}
                    min={14}
                    max={800}
                    step={1}
                    onChange={(v) => {
                      const w = widthsOf(selSheet);
                      w[selection.index] = v;
                      setSheet(selSheet.key, { colWeights: w });
                    }}
                  />
                </>
              )}
              <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => setSheet(selSheet.key, { colWeights: undefined, rowHeights: undefined, bold: undefined, title: undefined, cells: undefined, note: undefined })}>
                <RotateCcw className="h-3 w-3" aria-hidden />
                Reset this sheet’s text, rows and columns
              </button>
            </Section>
          )}

          <Section title="Text size (pt)">
            <Num label="Letterhead" value={settings.letterheadSize} min={5} max={24} step={0.1} onChange={(v) => set({ letterheadSize: v })} />
            <Num label="Project name" value={settings.projectSize} min={5} max={24} step={0.1} onChange={(v) => set({ projectSize: v })} />
            <Num label="Sheet title" value={settings.titleSize} min={5} max={24} step={0.1} onChange={(v) => set({ titleSize: v })} />
            <Num label="Column headings" value={settings.headerSize} min={4} max={16} step={0.1} onChange={(v) => set({ headerSize: v })} />
            <Num label="Table text" value={settings.bodySize} min={4} max={16} step={0.1} onChange={(v) => set({ bodySize: v })} />
            <Num label="Line spacing" value={settings.lineSpacing} min={1} max={2.5} step={0.05} onChange={(v) => set({ lineSpacing: v })} />
          </Section>

          <Section title="Lines and borders">
            <label className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
              <span>Borders</span>
              <select className="input h-7 w-36 text-xs" value={settings.borders} onChange={(ev) => set({ borders: ev.target.value as BorderStyle })}>
                <option value="grid">Full grid</option>
                <option value="rows">Row lines only</option>
                <option value="outer">Outer box only</option>
                <option value="none">None</option>
              </select>
            </label>
            <Num label="Inner line weight (pt)" value={settings.innerLine} min={0} max={3} step={0.04} onChange={(v) => set({ innerLine: v })} />
            <Num label="Outer line weight (pt)" value={settings.outerLine} min={0} max={4} step={0.04} onChange={(v) => set({ outerLine: v })} />
            <Check label="Shade the heading row" checked={settings.headerFill} onChange={(v) => set({ headerFill: v })} />
          </Section>

          <Section title="Rows and cells">
            <Num label="Minimum row height (pt)" value={settings.minRowHeight} min={4} max={60} step={0.25} onChange={(v) => set({ minRowHeight: v })} />
            <Num label="Cell padding (pt)" value={settings.cellPadding} min={0} max={12} step={0.2} onChange={(v) => set({ cellPadding: v })} />
            <Check label="Justify descriptions" checked={settings.justify} onChange={(v) => set({ justify: v })} />
            <Check label="Repeat headings on every page" checked={settings.repeatHeader} onChange={(v) => set({ repeatHeader: v })} />
            <p className="text-xs text-gray-500">On the page: click a row or a heading to select it, double-click any cell or heading to edit its text, drag a line between columns or under a row to resize.</p>
          </Section>

          <Section title="Page">
            <label className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
              <span>Paper</span>
              <select className="input h-7 w-36 text-xs" value={settings.paper} onChange={(ev) => set({ paper: ev.target.value as Paper })}>
                <option value="letter">Letter (as KPTCL prints)</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <Num label="Left and right margins (mm)" value={settings.marginMm} min={2} max={40} step={0.5} onChange={(v) => set({ marginMm: v })} />
            <Num label="Top margin (mm)" value={settings.topMm} min={2} max={40} step={0.5} onChange={(v) => set({ topMm: v })} />
            <Num label="Bottom margin (mm)" value={settings.bottomMm} min={2} max={40} step={0.5} onChange={(v) => set({ bottomMm: v })} />
            <Check label="Page numbers" checked={settings.pageNumbers} onChange={(v) => set({ pageNumbers: v })} />
            <Check label="Project name under the letterhead" checked={settings.showNotes} onChange={(v) => set({ showNotes: v })} />
            <label className="block text-[13px] text-gray-700">
              Letterhead (one line each)
              <textarea className="input mt-1" rows={2} value={settings.letterhead.join('\n')} onChange={(ev) => set({ letterhead: ev.target.value.split('\n') })} />
            </label>
            <label className="block text-[13px] text-gray-700">
              Signatures under the abstracts (one per line)
              <textarea className="input mt-1" rows={3} value={settings.signatures.join('\n')} onChange={(ev) => set({ signatures: ev.target.value.split('\n').filter((x, i, a) => x.trim() || i < a.length - 1) })} />
            </label>
          </Section>

          <div className="px-4 py-3">
            <button
              type="button"
              className="btn-secondary h-7 px-2 text-xs"
              onClick={() => {
                setStored(DEFAULT_PDF_SETTINGS);
                setSelection(null);
              }}
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Back to the standard format
            </button>
          </div>
        </aside>

        <section className="relative min-h-0 flex-1 overflow-auto p-4" aria-label="PDF preview">
          {!sheets ? (
            <p className="text-[13px] text-gray-600">Preparing the preview…</p>
          ) : pages.length === 0 ? (
            <p className="text-[13px] text-gray-600">Nothing to print. Import the BOQ estimate first, or include at least one sheet.</p>
          ) : (
            <div className="mx-auto flex w-max flex-col items-center gap-6">
              {settings.pageOrder && (
                <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => set({ pageOrder: undefined })}>
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Put the pages back in sheet order
                </button>
              )}
              {pages.map((p, i) => (
                <div key={pageKey(p)}>
                  <div className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                    <span className="mr-auto">
                      Page {i + 1} · {p.sheet}
                      {pages.filter((x) => x.sheet === p.sheet).length > 1 ? ` (${p.sheetPage} of ${pages.filter((x) => x.sheet === p.sheet).length})` : ''}
                    </span>
                    <button type="button" className="btn-ghost h-6 px-1.5 text-xs" aria-label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => movePage(i, -1)}>
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button type="button" className="btn-ghost h-6 px-1.5 text-xs" aria-label={`Move page ${i + 1} down`} disabled={i === pages.length - 1} onClick={() => movePage(i, 1)}>
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <PageView page={p} zoom={zoom} selection={selection} onSelect={setSelection} onDragCol={dragCol} onDragRow={dragRow} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
