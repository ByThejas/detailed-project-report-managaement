import { formatNumber } from '@/lib/format';
import type { EstimateSection } from '@/features/preparation/types';
import type { BoqReadResult, Cell, ColumnRole, Issue, ParsedItem, SheetGrid, SheetSummary, SkippedRow, TotalCheck } from './types';

/**
 * Reads BOQ tables out of worksheet grids. It never guesses silently: anything it had to interpret
 * (a quantity written as "2 Nos", an amount that disagrees with qty × rate, a hidden row) becomes an
 * issue the user must confirm, and anything it could not read becomes an error they must fix.
 */

const HEADER_SCAN_ROWS = 40;
/** Amounts in BOQs are often rounded to the rupee. */
const AMOUNT_TOLERANCE = 1;

export const columnLetter = (c: number): string => {
  let n = c + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const text = (v: Cell | undefined): string => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const norm = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

type Kind = 'supply' | 'erection' | 'testing' | null;
const kindOf = (l: string): Kind => {
  if (/erection|labour|installation/.test(l)) return 'erection';
  if (/testing|t ?& ?c\b|commission/.test(l)) return 'testing';
  if (/supply|material/.test(l)) return 'supply';
  return null;
};

/** Which role a header label plays, or null. */
export function roleOf(label: string): ColumnRole | null {
  const l = norm(label);
  if (!l) return null;
  const isAmount = /amount|value|\btotal\b/.test(l);
  const isRate = !isAmount && /rate|price|cost per/.test(l);
  if (isRate) return `${kindOf(l) ?? 'supply'}Rate` as ColumnRole;
  if (isAmount) return `${kindOf(l) ?? 'supply'}Amount` as ColumnRole;
  if (/\bqty\b|quantit/.test(l)) return 'qty';
  if (/descr|particular|item of work|name of (the )?(item|material|work)|specification/.test(l)) return 'description';
  if (/\b(unit|units|uom)\b/.test(l)) return 'unit';
  if (/^(sl|s|sr|item|serial)( ?no| ?number)?\b|^no$|^code$|item code|^sl$/.test(l)) return 'code';
  return null;
}

function mapColumns(labels: string[]): Partial<Record<ColumnRole, number>> {
  const map: Partial<Record<ColumnRole, number>> = {};
  labels.forEach((label, c) => {
    const role = roleOf(label);
    if (role && map[role] === undefined) map[role] = c;
  });
  return map;
}

/** Header text for a two-row header, carrying a merged top label (e.g. "Supply" over "Rate | Amount") to the right. */
function combinedLabels(top: Cell[], bottom: Cell[]): string[] {
  const width = Math.max(top.length, bottom.length);
  const out: string[] = [];
  let carry = '';
  for (let c = 0; c < width; c++) {
    const t = text(top[c]);
    const b = text(bottom[c]);
    if (t) carry = t;
    else if (!b) carry = '';
    out.push(`${t || (b ? carry : '')} ${b}`.trim());
  }
  return out;
}

const usable = (m: Partial<Record<ColumnRole, number>>) => m.description !== undefined && m.qty !== undefined;

function findHeader(rows: Cell[][]): { row: number; height: 1 | 2; map: Partial<Record<ColumnRole, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const single = mapColumns((rows[r] ?? []).map(text));
    const double = rows[r + 1] ? mapColumns(combinedLabels(rows[r] ?? [], rows[r + 1] ?? [])) : {};
    // A two-row header must start on a row that is itself part of the header, not a blank or title row.
    if (Object.keys(single).length > 0 && usable(double) && Object.keys(double).length > Object.keys(single).length) return { row: r, height: 2, map: double };
    if (usable(single)) return { row: r, height: 1, map: single };
  }
  return null;
}

interface NumberRead {
  value: number | null;
  issue?: Omit<Issue, 'field'>;
  /** Text after the number, e.g. "Nos" in "2 Nos". */
  trailing?: string;
}

/** Reads a number from a cell. Plain numbers and "1,23,456.50" are exact; anything else is flagged. */
export function readNumber(v: Cell, what: string): NumberRead {
  if (v === null || v === '') return { value: null };
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v } : { value: null, issue: { level: 'error', message: `${what} is not a valid number` } };
  const raw = v.trim();
  if (raw === '#NO_RESULT') return { value: null, issue: { level: 'error', message: `${what} is a formula with no saved result. Open the file in Excel, save it, and attach it again` } };
  if (/^#[A-Z/0!?]+/.test(raw)) return { value: null, issue: { level: 'error', message: `${what} shows the Excel error ${raw}` } };
  const plain = raw.replace(/,/g, '').replace(/^(rs\.?|₹)\s*/i, '');
  if (/^-?\d+(\.\d+)?$/.test(plain)) return { value: Number(plain) };
  const numbers = plain.match(/-?\d+(\.\d+)?/g) ?? [];
  if (numbers.length === 1) {
    const value = Number(numbers[0]);
    const trailing = plain.replace(numbers[0]!, '').replace(/^[\s.-]+|[\s.-]+$/g, '');
    return { value, trailing, issue: { level: 'warning', message: `${what} read from “${raw}” as ${value}` } };
  }
  if (numbers.length > 1) return { value: null, issue: { level: 'error', message: `${what} “${raw}” is not a single number` } };
  return { value: null, issue: { level: 'error', message: `${what} “${raw}” is not a number` } };
}

const TOTAL_ROW = /^(sub[\s-]*total|total|grand\s*total|gross\s*total|carried\s*(over|forward)|brought\s*forward|c\s*\/\s*f|b\s*\/\s*f)\b/i;
const SUB_ITEM = /^\(?([a-z]|[ivx]{1,4})\)?[.)]?$/i;
const SUMMARY_SHEET = /abstract|summary|cover|index|contents/i;

/** A row such as "1 2 3 4 5 6" under the header that only numbers the columns. */
const isColumnNumbering = (cells: Cell[]) => {
  const filled = cells.filter((c) => text(c) !== '');
  if (filled.length < 3) return false;
  return filled.every((c, i) => Number(text(c)) === Number(text(filled[0])) + i);
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function parseSheet(sheet: SheetGrid, idPrefix: string) {
  const items: ParsedItem[] = [];
  const skipped: SkippedRow[] = [];
  const totals: TotalCheck[] = [];
  const summary: SheetSummary = { name: sheet.name, headerRow: null, columns: {}, includedByDefault: !SUMMARY_SHEET.test(sheet.name) };
  const header = findHeader(sheet.rows);
  if (!header) {
    summary.note = 'No BOQ table found (needs a Description and a Quantity column)';
    return { items, skipped, totals, summary };
  }
  const col = header.map;
  summary.headerRow = header.row + 1;
  summary.columns = Object.fromEntries(Object.entries(col).map(([k, c]) => [k, columnLetter(c)]));
  if (!summary.includedByDefault) summary.note = 'Looks like a summary sheet, so it starts excluded to avoid counting items twice';

  const hidden = new Set(sheet.hiddenRows ?? []);
  const get = (cells: Cell[], role: ColumnRole) => (col[role] === undefined ? null : (cells[col[role]!] ?? null));
  let heading = '';
  let sinceLastTotal: ParsedItem[] = [];
  const seenCodes = new Map<string, ParsedItem>();

  for (let r = header.row + header.height; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] ?? [];
    const rowNo = r + 1;
    if (cells.every((c) => text(c) === '')) continue;
    if (isColumnNumbering(cells)) {
      skipped.push({ sheet: sheet.name, row: rowNo, code: '', description: cells.map(text).filter(Boolean).join(' '), reason: 'Column numbering row', canInclude: false });
      continue;
    }

    const code = text(get(cells, 'code'));
    const description = text(get(cells, 'description'));
    const qtyCell = get(cells, 'qty');

    if (TOTAL_ROW.test(description) || TOTAL_ROW.test(code)) {
      const grand = /grand|gross/i.test(description || code);
      const scope = grand ? items.filter((i) => i.sheet === sheet.name) : sinceLastTotal;
      for (const kind of ['supply', 'erection', 'testing'] as const) {
        const stated = readNumber(get(cells, `${kind}Amount`), 'Total').value;
        if (stated === null) continue;
        const computed = r2(scope.reduce((s, i) => s + (i.qty ?? 0) * i[`${kind}Rate`], 0));
        totals.push({ sheet: sheet.name, row: rowNo, label: description || code, column: kind, stated, computed });
      }
      if (!grand) sinceLastTotal = [];
      skipped.push({ sheet: sheet.name, row: rowNo, code, description: description || code, reason: 'Total row', canInclude: false });
      continue;
    }

    if (text(qtyCell) === '') {
      if (description) heading = description;
      skipped.push({
        sheet: sheet.name,
        row: rowNo,
        code,
        description: description || cells.map(text).filter(Boolean).join(' '),
        reason: description ? 'No quantity (heading or note)' : 'No description or quantity',
        canInclude: Boolean(description),
      });
      continue;
    }

    const issues: Issue[] = [];
    const qty = readNumber(qtyCell, 'Quantity');
    if (qty.issue) issues.push({ ...qty.issue, field: 'qty' });
    let qtyValue = qty.value;
    if (qtyValue !== null && qtyValue < 0) {
      issues.push({ level: 'error', field: 'qty', message: `Quantity ${qtyValue} is negative` });
      qtyValue = null;
    } else if (qtyValue === 0) {
      issues.push({ level: 'warning', field: 'qty', message: 'Quantity is 0' });
    }

    let unit = text(get(cells, 'unit'));
    if (!unit && qty.trailing && /^[a-z. ]{1,12}$/i.test(qty.trailing)) unit = qty.trailing;
    if (!unit) issues.push({ level: 'warning', field: 'unit', message: 'No unit' });
    if (!description) issues.push({ level: 'error', field: 'description', message: 'No description' });

    const rates = { supply: 0, erection: 0, testing: 0 };
    for (const kind of ['supply', 'erection', 'testing'] as const) {
      const read = readNumber(get(cells, `${kind}Rate`), `${kind[0]!.toUpperCase()}${kind.slice(1)} rate`);
      // A rate that can't be read is left blank (the BOQ then shows "Rate needed"), so it is a warning, not a blocker.
      if (read.issue) issues.push({ level: 'warning', field: 'rate', message: read.issue.level === 'error' ? `${read.issue.message}; left blank` : read.issue.message });
      if (read.value !== null && read.value < 0) issues.push({ level: 'warning', field: 'rate', message: `${kind[0]!.toUpperCase()}${kind.slice(1)} rate ${read.value} is negative; left blank` });
      else if (read.value !== null && read.issue?.level !== 'error') rates[kind] = read.value;

      const amount = readNumber(get(cells, `${kind}Amount`), 'Amount').value;
      if (amount !== null && qtyValue !== null && read.value !== null) {
        const expected = r2(qtyValue * read.value);
        if (Math.abs(expected - amount) > AMOUNT_TOLERANCE) {
          issues.push({ level: 'warning', field: 'amount', message: `${kind[0]!.toUpperCase()}${kind.slice(1)} amount in the file is ${formatNumber(amount)}, but qty × rate is ${formatNumber(expected)}` });
        }
      }
    }

    if (hidden.has(rowNo)) issues.push({ level: 'warning', field: 'row', message: 'This row is hidden in Excel' });

    const item: ParsedItem = {
      id: `${idPrefix}-${rowNo}`,
      sheet: sheet.name,
      row: rowNo,
      code,
      description,
      heading: SUB_ITEM.test(code) && heading ? heading : undefined,
      unit,
      qty: qtyValue,
      supplyRate: rates.supply,
      erectionRate: rates.erection,
      testingRate: rates.testing,
      issues,
    };
    if (code) {
      const key = `${item.heading ?? ''}|${code}`;
      const first = seenCodes.get(key);
      if (first) issues.push({ level: 'warning', field: 'row', message: `Item number ${code} also appears on row ${first.row}` });
      else seenCodes.set(key, item);
    }
    if (!SUB_ITEM.test(code)) heading = description;
    items.push(item);
    sinceLastTotal.push(item);
  }
  return { items, skipped, totals, summary };
}

export function parseBoq(sheets: SheetGrid[], fileName: string, section: EstimateSection, now = new Date()): BoqReadResult {
  const result: BoqReadResult = { fileName, section, readAt: now.toISOString(), sheets: [], items: [], skipped: [], totals: [] };
  sheets.forEach((sheet, i) => {
    if (sheet.hidden) {
      result.sheets.push({ name: sheet.name, headerRow: null, columns: {}, includedByDefault: false, note: 'Hidden sheet, not read' });
      return;
    }
    const part = parseSheet(sheet, `s${i}`);
    result.sheets.push(part.summary);
    result.items.push(...part.items);
    result.skipped.push(...part.skipped);
    result.totals.push(...part.totals);
  });
  if (result.items.length === 0 && !result.failure) {
    result.failure = 'No BOQ items found. The sheet needs a header row with a Description column and a Quantity column.';
  }
  return result;
}

/** Errors still open for an item given its current (possibly edited) values. Parse errors clear once the value is valid. */
export function openErrors(item: ParsedItem): Issue[] {
  const out: Issue[] = [];
  if (item.qty === null || !Number.isFinite(item.qty) || item.qty < 0) out.push({ level: 'error', field: 'qty', message: item.issues.find((i) => i.field === 'qty' && i.level === 'error')?.message ?? 'Enter a quantity' });
  if (!item.description.trim()) out.push({ level: 'error', field: 'description', message: 'No description' });
  return out;
}

export const warningsOf = (item: ParsedItem) => item.issues.filter((i) => i.level === 'warning');
