import { MM, PAPER, SHEET_TITLES, columnRole, defaultOrientation, heading, isAbstract, projectLine, standardWidths, totalLabel, type PdfSettings, type SheetSettings } from './format';
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

/** A rough Bookman measure for tests and before the fonts load. */
export const approxMeasure: Measure = (text, size, bold) => text.length * size * (bold ? 0.6 : 0.55);

/** A wrapped line, and whether it ends its paragraph (the last line of a paragraph is not justified). */
export interface WrappedLine {
  text: string;
  end: boolean;
}

/** Breaks text into lines that fit the width, splitting over-long words, and marks the last line of each paragraph. */
export function wrapLines(text: string, width: number, size: number, bold: boolean, measure: Measure): WrappedLine[] {
  const out: WrappedLine[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size, bold) <= width) {
        line = next;
        continue;
      }
      if (line) out.push({ text: line, end: false });
      line = '';
      let w = word;
      while (measure(w, size, bold) > width && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n), size, bold) > width) n--;
        out.push({ text: w.slice(0, n), end: false });
        w = w.slice(n);
      }
      line = w;
    }
    out.push({ text: line, end: true });
  }
  return out.length ? out : [{ text: '', end: true }];
}

/** Breaks text into lines that fit the width, splitting over-long words. */
export function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  return wrapLines(text, width, size, bold, measure).map((l) => l.text);
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

/** Column widths in points that fill the table width, from the user's weights or KPTCL's standard widths. */
export function columnWidths(sheet: PdfSheet, ss: SheetSettings, tableWidth: number): number[] {
  const weights = ss.colWeights?.length === sheet.columns.length ? ss.colWeights : sheet.weights?.length === sheet.columns.length ? sheet.weights : standardWidths(sheet.columns.map((c) => c.header), tableWidth);
  const sum = weights.reduce((a, b) => a + Math.max(b, 0.1), 0);
  return weights.map((w) => (Math.max(w, 0.1) / sum) * tableWidth);
}

/** Lays every included sheet out on pages as drawing operations. The preview and the PDF both draw these, so they match. */
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
      const size = s.bodySize;
      p.ops.push({ kind: 'text', x: (p.w - measure(text, size, false)) / 2, y: p.h - (s.bottomMm * MM) / 2, text, size, bold: false });
    });
  }
  return pages;
}

/** Where a line of text sits: lines are centred as a block in their box, on the capital height, as Excel prints them. */
const baselines = (count: number, top: number, height: number, size: number, step: number) => {
  const first = top + height / 2 - ((count - 1) * step) / 2 + size * 0.34 + size * 0.06;
  return Array.from({ length: count }, (_, i) => first + i * step);
};

function layoutSheet(sheet: PdfSheet, ss: SheetSettings, s: PdfSettings, measure: Measure): Page[] {
  const orientation = ss.orientation ?? defaultOrientation(sheet.columns.length);
  const paper = PAPER[s.paper] ?? PAPER.letter;
  const [w, h] = orientation === 'landscape' ? [paper.h, paper.w] : [paper.w, paper.h];
  const left = s.marginMm * MM;
  const tableWidth = w - 2 * left;
  const right = left + tableWidth;
  const topMargin = s.topMm * MM;
  const bottom = h - s.bottomMm * MM;
  const widths = columnWidths(sheet, ss, tableWidth);
  const xs = widths.reduce<number[]>((acc, cw) => [...acc, acc.at(-1)! + cw], [left]);
  const pad = s.cellPadding;
  const step = s.bodySize * s.lineSpacing;
  const roles = sheet.columns.map((c, i) => columnRole(c.header, i));
  const desc = roles.indexOf('desc');
  const aligns: Align[] = roles.map((r, i) => (r === 'sl' || r === 'unit' || r === 'qty' ? 'center' : r === 'desc' ? 'left' : sheet.columns[i]!.align === 'left' ? 'left' : 'right'));
  const headings = sheet.columns.map((c) => heading(c.header));
  const grouped = headings.some((x) => x.group);
  const pages: Page[] = [];
  let page!: Page;
  let y = 0;
  const line = (x1: number, y1: number, x2: number, y2: number, width: number) => {
    if (width > 0) page.ops.push({ kind: 'line', x1, y1, x2, y2, width });
  };
  const text = (t: string, x: number, by: number, size: number, bold: boolean) => {
    if (t) page.ops.push({ kind: 'text', x, y: by, text: t, size, bold });
  };

  const newPage = () => {
    page = { w, h, sheet: sheet.key, sheetPage: pages.length + 1, ops: [], table: null };
    pages.push(page);
    y = topMargin;
  };

  /** One boxed, centred row across the page (letterhead, project, sheet title). */
  const titleRow = (t: string, size: number, minHeight: number) => {
    const lines = wrap(t, tableWidth - 2 * pad, size, true, measure);
    const lstep = size * 1.27;
    const height = Math.max(minHeight, lines.length * lstep);
    baselines(lines.length, y, height, size, lstep).forEach((by, i) => text(lines[i]!, left + (tableWidth - measure(lines[i]!, size, true)) / 2, by, size, true));
    if (s.borders !== 'none') {
      const first = y === topMargin;
      line(left, y, right, y, first ? s.outerLine : s.borders === 'outer' ? 0 : s.innerLine);
      line(left, y, left, y + height, s.outerLine);
      line(right, y, right, y + height, s.outerLine);
    }
    y += height;
  };

  // Cell text and the row's height.
  const rowBlock = (cells: string[], size: number, bold: boolean, fixed?: number, cellBold?: (i: number) => boolean) => {
    const lines = cells.map((c, i) => wrapLines(c, Math.max(widths[i]! - 2 * pad, 4), size, cellBold?.(i) ?? bold, measure));
    const natural = Math.max(...lines.map((l) => l.length)) * size * s.lineSpacing;
    return { lines, height: fixed ?? Math.max(natural, s.minRowHeight) };
  };
  const drawCell = (lines: WrappedLine[], i: number, top: number, height: number, size: number, bold: boolean, align: Align, justify: boolean, lstep = size * s.lineSpacing, x0 = xs[i]!, x1 = xs[i + 1]!) => {
    const shown = lines.filter((_, k) => k * lstep < height + 0.5); // a row made shorter than its text clips the rest
    const width = x1 - x0 - 2 * pad;
    baselines(shown.length, top, Math.max(height, shown.length * lstep), size, lstep).forEach((by, k) => {
      const l = shown[k]!;
      if (!l.text) return;
      const words = l.text.split(' ');
      if (justify && !l.end && words.length > 1) {
        const widthsOf = words.map((wd) => measure(wd, size, bold));
        const gap = (width - widthsOf.reduce((a, b) => a + b, 0)) / (words.length - 1);
        let x = x0 + pad;
        words.forEach((wd, n) => {
          text(wd, x, by, size, bold);
          x += widthsOf[n]! + gap;
        });
        return;
      }
      const tw = measure(l.text, size, bold);
      const x = align === 'right' ? x1 - pad - tw : align === 'center' ? x0 + (x1 - x0 - tw) / 2 : x0 + pad;
      text(l.text, x, by, size, bold);
    });
  };

  // Two-level headings: a group ("Supply of Material") spans its columns above their own headings.
  const hsize = s.headerSize;
  const hstep = hsize * 1.25;
  const headCells = headings.map((x, i) => ss.cells?.[`-1:${i}`] ?? x.text);
  const headLines = headCells.map((c, i) => wrapLines(c, Math.max(widths[i]! - 2 * pad, 4), hsize, true, measure));
  const groupH = grouped ? hsize * s.lineSpacing : 0;
  const subH = Math.max(...headLines.map((l, i) => (headings[i]!.group ? l.length : 0)), 0) * hstep + hsize * 0.13;
  const fullH = Math.max(...headLines.map((l, i) => (headings[i]!.group ? 0 : l.length)), 1) * hstep + hsize * 0.3;
  const headerHeight = ss.rowHeights?.['-1'] ?? Math.max(groupH + subH, fullH, hsize * 3.92);
  const groups: { name: string; from: number; to: number }[] = [];
  headings.forEach((x, i) => {
    if (!x.group) return;
    const g = groups.at(-1);
    if (g && g.name === x.group && g.to === i - 1) g.to = i;
    else groups.push({ name: x.group, from: i, to: i });
  });
  const inGroupBand = (boundary: number) => {
    const a = headings[boundary - 1]?.group;
    return !!a && a === headings[boundary]?.group;
  };

  const drawHeader = () => {
    const top = y;
    if (s.headerFill) page.ops.push({ kind: 'rect', x: left, y: top, w: tableWidth, h: headerHeight, grey: 0.88 });
    headLines.forEach((l, i) => {
      const g = !!headings[i]!.group;
      drawCell(l, i, g ? top + groupH : top, g ? headerHeight - groupH : headerHeight, hsize, true, 'center', false, hstep);
    });
    for (const g of groups) {
      drawCell([{ text: g.name, end: true }], g.from, top, groupH, hsize, true, 'center', false, groupH, xs[g.from]!, xs[g.to + 1]!);
      if (s.borders === 'grid' || s.borders === 'rows') line(xs[g.from]!, top + groupH, xs[g.to + 1]!, top + groupH, s.innerLine);
    }
    page.table!.rows.push({ index: -1, y: top, h: headerHeight });
    y += headerHeight;
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
    const headed = t.rows[0]!.index === -1;
    if (s.borders === 'grid' || s.borders === 'rows')
      for (const r of t.rows.slice(1)) line(left, r.y, right, r.y, s.innerLine);
    if (s.borders === 'outer' && headed && t.rows[1]) line(left, t.rows[1].y, right, t.rows[1].y, s.innerLine);
    if (s.borders === 'grid')
      xs.slice(1, -1).forEach((x, k) => {
        // Inside a group the line starts under the group's heading.
        const from = headed && inGroupBand(k + 1) ? top + groupH : top;
        line(x, from, x, end, s.innerLine);
      });
    if (s.borders !== 'none') {
      line(left, top, right, top, s.outerLine);
      line(left, end, right, end, s.outerLine);
      line(left, top, left, end, s.outerLine);
      line(right, top, right, end, s.outerLine);
    }
  };

  newPage();
  for (const l of s.letterhead.filter((x) => x.trim())) titleRow(l, s.letterheadSize, s.letterheadSize * 1.27);
  const note = ss.note ?? (sheet.notes[0] ? projectLine(sheet.notes[0]) : '');
  if (s.showNotes && note?.trim()) titleRow(note, s.projectSize, s.projectSize * 2.66);
  titleRow(ss.title?.trim() || SHEET_TITLES[sheet.key] || sheet.title, s.titleSize, s.titleSize * 1.306);
  startTable(true);

  sheet.rows.forEach((row, index) => {
    const bold = ss.bold?.[String(index)] ?? row.bold;
    // Closing rows print their label in bold, centred under the description.
    const cells = row.cells.map((c, i) => ss.cells?.[`${index}:${i}`] ?? (row.total && i === desc ? totalLabel(c) : c));
    // Item numbers like A1, A12 print bold; sub-items (a, b, i, 1) do not.
    const cellBold = (i: number) => (row.total && i === desc) || bold || (roles[i] === 'sl' && /^[A-Z]{1,3}\d+$/.test(cells[i]!.trim()));
    const block = rowBlock(cells, s.bodySize, bold, ss.rowHeights?.[String(index)], cellBold);
    if (y + block.height > bottom && page.table!.rows.some((r) => r.index >= 0)) {
      closeTable();
      newPage();
      startTable(s.repeatHeader);
    }
    block.lines.forEach((l, i) =>
      drawCell(l, i, y, block.height, s.bodySize, cellBold(i), row.total && i === desc ? 'center' : aligns[i]!, s.justify && i === desc && !row.total, step),
    );
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
      const t = sig.trim();
      if (!t) return;
      const tw = measure(t, s.titleSize, true);
      text(t, left + slot * i + (slot - tw) / 2, y, s.titleSize, true);
    });
  }
  return pages;
}
