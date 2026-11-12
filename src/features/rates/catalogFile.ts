import type { Cell, SheetGrid } from '@/features/boq-import/types';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import type { CatalogItem, RateCatalog } from './types';

/*
 * Reads and writes the rate catalog workbook, the same way scripts/generate-rates.mjs builds the
 * built-in one. Each sheet has columns Code | Kind | Item | Unit | Rate | SR ref | Remarks. A coded
 * Supply row is followed by its uncoded Labour and T&C rows. Rows without a kind are chapter headings
 * ("… (12 items)") or a shared description for the items below them; both are kept as context.
 */

const clean = (v: Cell | undefined) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v: Cell | undefined) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const HEADERS = ['Code', 'Kind', 'Item / Activity', 'Unit', 'Rate', 'SR ref', 'Remarks'];

/** The version in a catalog file name: "rate_catalog 76.xlsx" → 76. */
export const versionOf = (fileName: string) => Number(/(\d+)\.xls[xm]?$/i.exec(fileName)?.[1] ?? 0) || null;

export function parseCatalogGrids(grids: SheetGrid[], fileName: string): RateCatalog {
  const items: CatalogItem[] = [];
  for (const ws of grids) {
    let chapter = '';
    let context = '';
    let current: CatalogItem | null = null;
    ws.rows.forEach((row, r) => {
      const n = r + 1;
      if (n === 1 || !row.some((c) => c !== null && c !== '')) return;
      const code = clean(row[0]);
      const kind = clean(row[1]);
      const text = clean(row[2]);
      const unit = clean(row[3]);
      const rate = num(row[4]);
      const sr = clean(row[5]);
      if (!kind) {
        if (code && code !== '—' && /\(\d+ items?\)\s*$/.test(text)) {
          chapter = text.replace(/\s*\(\d+ items?\)\s*$/, '');
          context = '';
        } else if (code === '—') {
          chapter = '';
          context = '';
        } else context = text;
        current = null;
        return;
      }
      if (kind === 'Supply' || (code && code !== '—')) {
        current = { id: `${ws.name}#${n}`, sheet: ws.name, code, kind, item: text, context: [chapter, context].filter(Boolean).join(' · '), unit, rate, sr, labour: [], tc: [] };
        items.push(current);
        return;
      }
      if (!current || rate === null) return;
      (kind === 'T&C' ? current.tc : current.labour).push({ text, unit, rate, sr });
    });
  }
  return { source: fileName, version: versionOf(fileName), items };
}

/** Reads an uploaded catalog workbook (.xlsx or old .xls). Throws a message for the user when it has no rates. */
export async function readCatalogFile(buffer: ArrayBuffer, fileName: string): Promise<RateCatalog> {
  let grids: SheetGrid[];
  try {
    grids = await workbookToGrids(buffer);
  } catch {
    throw new Error(`${fileName} could not be read as an Excel workbook.`);
  }
  const catalog = parseCatalogGrids(grids, fileName);
  if (!catalog.items.some((i) => i.rate !== null && i.rate > 0))
    throw new Error(`No rates found in ${fileName}. Each sheet needs the columns ${HEADERS.slice(0, 6).join(' | ')} with a header in row 1, as in the downloaded catalog.`);
  return catalog;
}

const keyOf = (i: CatalogItem) => `${i.sheet}|${i.code}|${i.item}`;

/**
 * Gives items of a new catalog the ids of the same items in the old one (same sheet, code and text, or
 * else the same sheet and code), so choices remembered for BOQ wording keep pointing at them.
 */
export function adoptIds(prev: RateCatalog, next: RateCatalog): RateCatalog {
  // The same text can appear more than once (one item per rate band), so ids are taken in order.
  const exact = new Map<string, string[]>();
  const byCode = new Map<string, string[]>();
  for (const i of prev.items) {
    exact.set(keyOf(i), [...(exact.get(keyOf(i)) ?? []), i.id]);
    if (i.code) byCode.set(`${i.sheet}|${i.code}`, [...(byCode.get(`${i.sheet}|${i.code}`) ?? []), i.id]);
  }
  const used = new Set<string>();
  const ids = next.items.map((i) => {
    const id = exact.get(keyOf(i))?.find((x) => !used.has(x));
    if (id) return used.add(id), id;
    return null;
  });
  next.items.forEach((i, n) => {
    if (ids[n] || !i.code) return;
    const left = (byCode.get(`${i.sheet}|${i.code}`) ?? []).filter((id) => !used.has(id));
    if (left.length === 1) ids[n] = (used.add(left[0]!), left[0]!);
  });
  // Items still without an id keep their row id, unless an old item took it.
  const items = next.items.map((i, n) => {
    let id = ids[n] ?? i.id;
    while (ids[n] === null && used.has(id)) id = `${id}+`;
    if (ids[n] === null) used.add(id);
    return id === i.id ? i : { ...i, id };
  });
  return { ...next, items };
}

export interface CatalogDiff {
  added: number;
  removed: number;
  /** Items whose supply rate changed, old and new. */
  changed: { item: CatalogItem; was: number | null }[];
}

/** What replacing `prev` with `next` changes (`next` with ids from adoptIds). */
export function diffCatalogs(prev: RateCatalog, next: RateCatalog): CatalogDiff {
  const old = new Map(prev.items.map((i) => [i.id, i]));
  const ids = new Set(next.items.map((i) => i.id));
  const changed: CatalogDiff['changed'] = [];
  let added = 0;
  for (const i of next.items) {
    const o = old.get(i.id);
    if (!o) added += 1;
    else if ((o.rate ?? 0) !== (i.rate ?? 0)) changed.push({ item: i, was: o.rate });
  }
  return { added, removed: prev.items.filter((i) => !ids.has(i.id)).length, changed };
}

/**
 * The catalog as a workbook in the same layout it is read from, so it can be edited in Excel and
 * uploaded again. Each change of context starts with a "—" row and the context text.
 */
export async function catalogToWorkbook(catalog: RateCatalog): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DPR Manager';
  const sheets = new Map<string, CatalogItem[]>();
  for (const i of catalog.items) sheets.set(i.sheet, [...(sheets.get(i.sheet) ?? []), i]);
  for (const [name, items] of sheets) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.addRow(HEADERS).font = { bold: true };
    ws.columns = [10, 10, 90, 10, 16, 16, 20].map((width) => ({ width }));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    let context: string | null = null;
    for (const i of items) {
      if (i.context !== context) {
        ws.addRow(['—', null, null]);
        if (i.context) ws.addRow([null, null, i.context]).font = { bold: true };
        context = i.context;
      }
      ws.addRow([i.code || null, i.kind, i.item, i.unit, i.rate ?? 'NA', i.sr || null]);
      for (const c of i.labour) ws.addRow([null, 'Labour', c.text, c.unit, c.rate, c.sr || null]);
      for (const c of i.tc) ws.addRow([null, 'T&C', c.text, c.unit, c.rate, c.sr || null]);
    }
    ws.getColumn(5).numFmt = '#,##0.00';
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
