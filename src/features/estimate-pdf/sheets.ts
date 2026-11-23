import type { Workbook, Worksheet, Cell, CellValue } from 'exceljs';

export type Align = 'left' | 'right' | 'center';

export interface PdfColumn {
  header: string;
  /** Width as Excel stores it (characters); the layout scales these to the page. */
  width: number;
  align: Align;
}

export interface PdfRow {
  cells: string[];
  bold: boolean;
  /** A closing row of a BOQ sheet (sub total, miscellaneous, total): a label with no code or quantity. */
  total?: boolean;
}

/** One estimate or abstract sheet, reduced to what the PDF prints. */
export interface PdfSheet {
  /** The worksheet name, used as the key for per-sheet settings. */
  key: string;
  title: string;
  /** The lines under the title in the Excel (project and capacity). */
  notes: string[];
  columns: PdfColumn[];
  rows: PdfRow[];
}

/** Sheets that are not part of the abstract and estimate (BCR, cost-benefit, PERT) are left out. */
const NOT_ESTIMATE = /bcr|cost-benefit|pert|schedule/i;

/** Print order: general abstract, then each abstract followed by the sheets it adds up. */
const ORDER = ['General Abstract', 'Abstract-I', 'Part A Electrical', 'Part B Civil', 'Line Abstract', 'Line Supply', 'Line Civil', 'Abstract-II', 'Dismantling'];

/** Characters Helvetica (WinAnsi) can print beyond Latin-1. Anything else would make pdf-lib throw. */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const SWAP: Record<string, string> = { '₹': 'Rs.', '≥': '>=', '≤': '<=', '−': '-', '\t': ' ', ' ': ' ' };

/** Makes text printable with the PDF's standard fonts. */
export function printable(text: string): string {
  let out = '';
  for (const ch of text) {
    if (SWAP[ch] !== undefined) out += SWAP[ch];
    else if (ch === '\n') out += ch;
    else {
      const c = ch.codePointAt(0)!;
      out += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch) ? ch : '?';
    }
  }
  return out.replace(/\r/g, '');
}

const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** The figure a cell shows: a formula's stored result, rich text joined, hyperlinks as their text. */
function rawValue(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toLocaleDateString('en-IN');
    if ('result' in v) return rawValue((v as { result?: CellValue }).result ?? null);
    if ('formula' in v || 'sharedFormula' in v) return null;
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as { text: unknown }).text);
    if ('error' in v) return null;
  }
  return v;
}

/** Cell text as the Excel shows it: two decimals in Indian grouping where the cell is formatted that way, zeros blank. */
export function cellText(cell: Cell): string {
  const v = rawValue(cell.value);
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.abs(v) < 0.005) return '';
    const fmt = cell.numFmt ?? '';
    return /0\.00/.test(fmt) ? inr2.format(v) : inrN.format(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return printable(String(v).trim());
}

const isNumeric = (cell: Cell) => typeof rawValue(cell.value) === 'number';

/** Reads one worksheet: the title is the first cell, the header is the first row with three or more text cells, and the table runs to the first empty row. */
export function sheetFromWorksheet(ws: Worksheet): PdfSheet | null {
  const last = ws.rowCount;
  let headerAt = 0;
  let width = 0;
  for (let r = 1; r <= Math.min(last, 30); r++) {
    const row = ws.getRow(r);
    let texts = 0;
    let lastCol = 0;
    row.eachCell((c, n) => {
      const v = rawValue(c.value);
      if (typeof v === 'string' && v.trim()) texts++;
      if (v !== null && v !== '') lastCol = n;
    });
    if (texts >= 3) {
      headerAt = r;
      width = lastCol;
      break;
    }
  }
  if (!headerAt) return null;

  const title = cellText(ws.getRow(1).getCell(1)) || ws.name;
  const notes: string[] = [];
  for (let r = 2; r < headerAt; r++) {
    const t = cellText(ws.getRow(r).getCell(1));
    if (t) notes.push(t);
  }
  const header = ws.getRow(headerAt);
  const headers = Array.from({ length: width }, (_, i) => cellText(header.getCell(i + 1)));
  const qtyCol = headers.findIndex((h) => /^qty|quantity/i.test(h));

  const rows: PdfRow[] = [];
  const numericCount = new Array<number>(width).fill(0);
  const filledCount = new Array<number>(width).fill(0);
  for (let r = headerAt + 1; r <= last; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: width }, (_, i) => row.getCell(i + 1));
    const texts = cells.map(cellText);
    if (texts.every((t) => !t)) break;
    // Item rows (they carry a code in the first column) with no quantity are left out, as in the Excel download.
    if (qtyCol > 0 && texts[0] && !texts[qtyCol]) continue;
    cells.forEach((c, i) => {
      if (texts[i]) {
        filledCount[i]!++;
        if (isNumeric(c)) numericCount[i]!++;
      }
    });
    const total = qtyCol > 0 && !texts[0] && !texts[qtyCol] && !!texts[1];
    rows.push({ cells: texts, bold: cells.some((c) => c.font?.bold) || !!row.font?.bold, ...(total ? { total } : {}) });
  }

  const columns: PdfColumn[] = headers.map((h, i) => ({
    header: h,
    width: ws.getColumn(i + 1).width ?? 10,
    align: i === 0 ? 'center' : filledCount[i]! > 0 && numericCount[i]! / filledCount[i]! > 0.6 ? 'right' : 'left',
  }));
  return { key: ws.name, title, notes, columns, rows };
}

/** The abstract and estimate sheets of a workbook, in print order. */
export function sheetsFromWorkbook(wb: Workbook): PdfSheet[] {
  const out: PdfSheet[] = [];
  wb.eachSheet((ws) => {
    if (NOT_ESTIMATE.test(ws.name)) return;
    const s = sheetFromWorksheet(ws);
    if (s && s.rows.length) out.push(s);
  });
  const rank = (k: string) => {
    const i = ORDER.indexOf(k);
    return i < 0 ? ORDER.length : i;
  };
  return out.sort((a, b) => rank(a.key) - rank(b.key));
}

/** Reads an .xlsx the user exported (and perhaps edited in Excel). */
export async function sheetsFromFile(file: Blob): Promise<PdfSheet[]> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return sheetsFromWorkbook(wb);
}
