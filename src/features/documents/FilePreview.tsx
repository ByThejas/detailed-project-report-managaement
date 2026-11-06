import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import { getFile, type StoredFile } from '@/lib/fileStore';
import type { Cell, SheetGrid } from '@/features/boq-import/types';

/** Rows shown per sheet in a workbook preview; enough to recognise the file without slowing the page. */
const MAX_ROWS = 300;
const MAX_COLS = 30;

type Kind = 'pdf' | 'image' | 'sheet' | 'text' | 'word' | 'other';

function kindOf(name: string, type = ''): Kind {
  const n = name.toLowerCase();
  if (type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return 'image';
  if (/\.xls[xm]?$/.test(n)) return 'sheet';
  if (n.endsWith('.docx')) return 'word';
  if (type.startsWith('text/') || /\.(txt|csv)$/.test(n)) return 'text';
  return 'other';
}

const MIME: Record<string, string> = { pdf: 'application/pdf', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const mimeOf = (f: StoredFile) => f.type || MIME[f.name.toLowerCase().split('.').pop() ?? ''] || 'application/octet-stream';

type Body =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; kind: Kind; url: string; sheets?: SheetGrid[]; text?: string };

async function load(file: StoredFile): Promise<Body> {
  const kind = kindOf(file.name, file.type);
  // No object URLs in some test environments; the preview still shows text and sheets there.
  const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([file.data], { type: mimeOf(file) })) : '';
  if (kind === 'sheet') {
    const { workbookToGrids } = await import('@/features/boq-import/readWorkbook');
    return { state: 'ready', kind, url, sheets: (await workbookToGrids(file.data.slice(0))).filter((s) => !s.hidden) };
  }
  if (kind === 'text') return { state: 'ready', kind, url, text: new TextDecoder().decode(file.data) };
  if (kind === 'word') {
    const { readFileText } = await import('@/features/dpr-document/extract');
    const t = await readFileText({ name: file.name, type: file.type, bytes: file.data }, '');
    return { state: 'ready', kind, url, text: t.pages.join('\n').trim() };
  }
  return { state: 'ready', kind, url };
}

const show = (c: Cell) => (c === null ? '' : typeof c === 'number' ? (Number.isInteger(c) ? String(c) : c.toLocaleString('en-IN', { maximumFractionDigits: 4 })) : c);

function SheetView({ sheets }: { sheets: SheetGrid[] }) {
  const [i, setI] = useState(0);
  const sheet = sheets[i];
  if (!sheet) return <p className="p-4 text-[13px] text-gray-600">The workbook has no visible sheets.</p>;
  const rows = sheet.rows.slice(0, MAX_ROWS);
  const cols = Math.min(MAX_COLS, Math.max(0, ...rows.map((r) => r.length)));
  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-2">
          {sheets.map((s, k) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={k === i}
              onClick={() => setI(k)}
              className={`whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs font-medium ${k === i ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <table className="text-xs text-gray-800">
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-gray-100">
                <th scope="row" className="num sticky left-0 bg-gray-50 px-2 py-1 text-right font-normal text-gray-400">
                  {ri + 1}
                </th>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci} className={`max-w-[28rem] border-l border-gray-100 px-2 py-1 align-top ${typeof r[ci] === 'number' ? 'num text-right' : ''}`}>
                    {show(r[ci] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.length > MAX_ROWS && <p className="px-3 py-2 text-xs text-gray-500">Showing the first {MAX_ROWS} of {sheet.rows.length} rows. Download the file to see the rest.</p>}
      </div>
    </div>
  );
}

/**
 * Shows an attached file in a dialog. Files are read from this browser's store, where Documents keeps
 * them when they are attached.
 */
export function FilePreview({ dprId, docKey, name, onClose }: { dprId: string; docKey: string; name: string; onClose: () => void }) {
  const [body, setBody] = useState<Body>({ state: 'loading' });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let url: string | undefined;
    let live = true;
    getFile(dprId, docKey, name)
      .then((f) => (f ? load(f) : ({ state: 'missing' } as Body)))
      .catch(() => ({ state: 'failed', message: 'The file could not be opened.' }) as Body)
      .then((b) => {
        if (b.state === 'ready') url = b.url;
        if (live) setBody(b);
        else if (url) URL.revokeObjectURL(url);
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dprId, docKey, name]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ready = body.state === 'ready' ? body : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-2 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview: ${name}`}
        className="flex h-full max-h-[52rem] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-900" title={name}>
            {name}
          </h2>
          {ready && (
            <>
              {(ready.kind === 'pdf' || ready.kind === 'image') && (
                <a href={ready.url} target="_blank" rel="noreferrer" className="btn-ghost h-8 px-2 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Open in new tab
                </a>
              )}
              <a href={ready.url} download={name} className="btn-secondary h-8 px-2 text-xs">
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download
              </a>
            </>
          )}
          <button ref={closeRef} type="button" className="btn-ghost h-8 w-8 p-0" aria-label="Close preview" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-gray-50">
          {body.state === 'loading' && <p className="p-4 text-[13px] text-gray-500">Opening…</p>}
          {body.state === 'missing' && (
            <p className="p-4 text-[13px] text-gray-700">This file isn’t stored in this browser, only its name. Attach it again in Documents to preview it here.</p>
          )}
          {body.state === 'failed' && <p className="p-4 text-[13px] text-rose-700">{body.message}</p>}
          {ready?.kind === 'pdf' && <iframe title={`PDF: ${name}`} src={ready.url} className="h-full w-full bg-white" />}
          {ready?.kind === 'image' && (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img src={ready.url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {ready?.kind === 'sheet' && <div className="h-full bg-white">{ready.sheets && <SheetView sheets={ready.sheets} />}</div>}
          {(ready?.kind === 'text' || ready?.kind === 'word') && (
            <pre className="h-full overflow-auto whitespace-pre-wrap bg-white p-4 font-sans text-[13px] text-gray-800">{ready.text || 'No text found in this file.'}</pre>
          )}
          {ready?.kind === 'other' && <p className="p-4 text-[13px] text-gray-700">This type of file can’t be shown in the browser. Use Download to open it.</p>}
        </div>
      </div>
    </div>
  );
}
