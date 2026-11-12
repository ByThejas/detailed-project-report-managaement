import { A4, MM, defaultOrientation, isAbstract, type PdfSettings, type SheetSettings } from './format';
import type { Align, PdfSheet } from './sheets';

/** Width of a string in points at a font size; the PDF's own font metrics in the app, an estimate in tests. */
export type Measure = (text: string, size: number, bold: boolean) => number;

/** Everything is in points with the origin at the top left of the page; y of text is its baseline. */
export type Op =
  | { kind: 'text'; x: number; y: number; text: string; size: number; bold: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; grey: number };

/** Where the table sits on a page, so the editor can select and resize rows and columns. */
export interface TableBox {
  /** Column boundaries, left to right (columns + 1 values). */
  xs: number[];
  /** Rows on this page; index -1 is the header. */
  rows: { index: number; y: number; h: number }[];
}

export interface Page {
  w: number;
  h: number;
  sheet: string;
  /** Page number within the sheet, from 1. */
  sheetPage: number;
  ops: Op[];
  table: TableBox | null;
}

/** A rough Helvetica measure for tests and before the fonts load. */
export const approxMeasure: Measure = (text, size, bold) => text.length * size * (bold ? 0.56 : 0.52);

/** Breaks text into lines that fit the width, splitting over-long words. */
export function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size, bold) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = '';
      let w = word;
      while (measure(w, size, bold) > width && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n), size, bold) > width) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

/** Sheets in the user's order; any sheet the order does not name keeps its place after them. */
export function orderSheets<T extends { key: string }>(sheets: T[], order?: string[]): T[] {
  if (!order?.length) return sheets;
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i < 0 ? order.length : i;
  };
  return sheets.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.key) - rank(b.x.key) || a.i - b.i).map(({ x }) => x);
}

export const pageKey = (p: Pick<Page, 'sheet' | 'sheetPage'>) => `${p.sheet}#${p.sheetPage}`;

/** Pages in the user's order. A page the order does not name (a sheet grew a page) stays right after the page before it. */
export function orderPages(pages: Page[], order?: string[]): Page[] {
  if (!order?.length) return pages;
  const byKey = new Map(pages.map((p) => [pageKey(p), p]));
  const placed = order.filter((k) => byKey.has(k));
  const out: Page[] = placed.map((k) => byKey.get(k)!);
  const seen = new Set(placed);
  pages.forEach((p, i) => {
    if (seen.has(pageKey(p))) return;
    const prev = i > 0 ? pages[i - 1] : undefined;
    const at = prev ? out.indexOf(prev) : -1;
    out.splice(at + 1, 0, p);
    seen.add(pageKey(p));
  });
  return out;
}

export function sheetSettings(s: PdfSettings, key: string): SheetSettings {
  return s.sheets[key] ?? {};
}

/** Column widths in points that fill the table width, from the user's weights or the Excel's widths. */
export function columnWidths(sheet: PdfSheet, ss: SheetSettings, tableWidth: number): number[] {
  const weights = ss.colWeights?.length === sheet.columns.length ? ss.colWeights : sheet.columns.map((c) => c.width);
  const sum = weights.reduce((a, b) => a + Math.max(b, 0.1), 0);
  return weights.map((w) => (Math.max(w, 0.1) / sum) * tableWidth);
}

/** Lays every included sheet out on A4 pages as drawing operations. The preview and the PDF both draw these, so they match. */
export function layout(sheets: PdfSheet[], s: PdfSettings, measure: Measure): Page[] {
  const natural: Page[] = [];
  for (const sheet of orderSheets(sheets, s.sheetOrder)) {
    const ss = sheetSettings(s, sheet.key);
    if (ss.include === false) continue;
    natural.push(...layoutSheet(sheet, ss, s, measure));
  }
  const pages = orderPages(natural, s.pageOrder);
  if (s.pageNumbers) {
    pages.forEach((p, i) => {
      const text = `Page ${i + 1} of ${pages.length}`;
      const size = 7.5;
      p.ops.push({ kind: 'text', x: p.w - s.marginMm * MM - measure(text, size, false), y: p.h - (s.marginMm * MM) / 2, text, size, bold: false });
    });
  }
  return pages;
}

function layoutSheet(sheet: PdfSheet, ss: SheetSettings, s: PdfSettings, measure: Measure): Page[] {
  const orientation = ss.orientation ?? defaultOrientation(sheet.columns.length);
  const [w, h] = orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h];
  const m = s.marginMm * MM;
  const left = m;
  const tableWidth = w - 2 * m;
  const bottom = h - m - (s.pageNumbers ? 10 : 0);
  const widths = columnWidths(sheet, ss, tableWidth);
  const xs = widths.reduce<number[]>((acc, cw) => [...acc, acc.at(-1)! + cw], [left]);
  const pad = s.cellPadding;
  const pages: Page[] = [];
  let page!: Page;
  let y = 0;

  const newPage = () => {
    page = { w, h, sheet: sheet.key, sheetPage: pages.length + 1, ops: [], table: null };
    pages.push(page);
    y = m;
  };
  const centred = (text: string, size: number, bold: boolean) => {
    for (const line of wrap(text, tableWidth, size, bold, measure)) {
      y += size * s.lineSpacing;
      page.ops.push({ kind: 'text', x: left + (tableWidth - measure(line, size, bold)) / 2, y: y - size * 0.25, text: line, size, bold });
    }
  };

  // Row content: wrapped cell lines and the row's height.
  const rowBlock = (cells: string[], size: number, bold: boolean, fixed?: number) => {
    const lines = cells.map((c, i) => wrap(c, Math.max(widths[i]! - 2 * pad, 4), size, bold, measure));
    const natural = Math.max(...lines.map((l) => l.length)) * size * s.lineSpacing + 2 * pad;
    return { lines, height: fixed ?? Math.max(natural, s.minRowHeight) };
  };
  const drawRow = (lines: string[][], top: number, height: number, size: number, bold: boolean, aligns: Align[], valignMiddle: boolean) => {
    lines.forEach((cellLines, i) => {
      const own = cellLines.length * size * s.lineSpacing;
      let ty = top + pad + (valignMiddle ? Math.max(0, (height - 2 * pad - own) / 2) : 0);
      for (const line of cellLines) {
        ty += size * s.lineSpacing;
        if (ty > top + height + 0.5) break; // a row made shorter than its text clips the rest
        if (!line) continue;
        const tw = measure(line, size, bold);
        const a = aligns[i] ?? 'left';
        const x = a === 'right' ? xs[i + 1]! - pad - tw : a === 'center' ? xs[i]! + (widths[i]! - tw) / 2 : xs[i]! + pad;
        page.ops.push({ kind: 'text', x, y: ty - size * 0.25, text: line, size, bold });
      }
    });
  };

  const header = rowBlock(
    sheet.columns.map((c, i) => ss.cells?.[`-1:${i}`] ?? c.header),
    s.headerSize,
    true,
    ss.rowHeights?.['-1'],
  );
  const drawHeader = () => {
    const top = y;
    if (s.headerFill) page.ops.push({ kind: 'rect', x: left, y: top, w: tableWidth, h: header.height, grey: 0.88 });
    drawRow(header.lines, top, header.height, s.headerSize, true, sheet.columns.map(() => 'center'), true);
    page.table!.rows.push({ index: -1, y: top, h: header.height });
    y += header.height;
  };
  const startTable = (withHeader: boolean) => {
    page.table = { xs, rows: [] };
    if (withHeader) drawHeader();
  };
  const closeTable = () => {
    const t = page.table;
    if (!t || !t.rows.length) return;
    const top = t.rows[0]!.y;
    const end = t.rows.at(-1)!.y + t.rows.at(-1)!.h;
    const line = (x1: number, y1: number, x2: number, y2: number, width: number) => width > 0 && page.ops.push({ kind: 'line', x1, y1, x2, y2, width });
    if (s.borders === 'grid' || s.borders === 'rows')
      for (const r of t.rows.slice(1)) line(left, r.y, left + tableWidth, r.y, s.innerLine);
    if (s.borders === 'outer' && t.rows[0]!.index === -1 && t.rows[1]) line(left, t.rows[1].y, left + tableWidth, t.rows[1].y, s.innerLine);
    if (s.borders === 'grid') for (const x of xs.slice(1, -1)) line(x, top, x, end, s.innerLine);
    if (s.borders !== 'none') {
      line(left, top, left + tableWidth, top, s.outerLine);
      line(left, end, left + tableWidth, end, s.outerLine);
      line(left, top, left, end, s.outerLine);
      line(left + tableWidth, top, left + tableWidth, end, s.outerLine);
    }
  };

  newPage();
  for (const l of s.letterhead.filter((x) => x.trim())) centred(l, s.titleSize, true);
  const note = ss.note ?? sheet.notes[0];
  if (s.showNotes && note?.trim()) centred(note, s.bodySize + 0.5, false);
  y += 4;
  centred(ss.title?.trim() || sheet.title, s.titleSize, true);
  y += 6;
  startTable(true);

  sheet.rows.forEach((row, index) => {
    const bold = ss.bold?.[String(index)] ?? row.bold;
    const block = rowBlock(row.cells.map((c, i) => ss.cells?.[`${index}:${i}`] ?? c), s.bodySize, bold, ss.rowHeights?.[String(index)]);
    if (y + block.height > bottom && page.table!.rows.some((r) => r.index >= 0)) {
      closeTable();
      newPage();
      startTable(s.repeatHeader);
    }
    drawRow(block.lines, y, block.height, s.bodySize, bold, sheet.columns.map((c) => c.align), false);
    page.table!.rows.push({ index, y, h: block.height });
    y += block.height;
  });
  closeTable();

  if (s.signatures.length && isAbstract(sheet.key)) {
    const need = 54;
    if (y + need > bottom) {
      newPage();
      page.table = null;
    }
    y += 44;
    const slot = tableWidth / s.signatures.length;
    s.signatures.forEach((sig, i) => {
      const text = sig.trim();
      if (!text) return;
      const tw = measure(text, s.bodySize, true);
      page.ops.push({ kind: 'text', x: left + slot * i + (slot - tw) / 2, y, text, size: s.bodySize, bold: true });
    });
  }
  return pages;
}
