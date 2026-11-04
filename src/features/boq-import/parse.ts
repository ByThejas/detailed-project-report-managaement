import { formatNumber } from '@/lib/format';
import type { EstimateSection } from '@/features/preparation/types';
import type { BoqReadResult, Cell, ColumnRole, Issue, MiscRow, ParsedItem, SheetGrid, SheetSummary, SkippedRow, StatedAbstract, TotalCheck } from './types';

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
  if (/err?ection|labour|installation|dismantl/.test(l)) return 'erection';
  if (/testing|t ?& ?c\b|commission/.test(l)) return 'testing';
  if (/supply|material/.test(l)) return 'supply';
  return null;
};

/** Which role a header label plays, or null. */
export function roleOf(label: string): ColumnRole | null {
  const l = norm(label);
  if (!l) return null;
  // "TOTAL Quantity" is a quantity, not an amount.
  if (/\bqty\b|quantit|\bqnty\b/.test(l) && !/amount|\bamt\b|rate|value/.test(l)) return /\btotal\b/.test(l) ? 'totalQty' : 'qty';
  const isAmount = /amount|\bamt\b|value|\btotal\b/.test(l);
  const isRate = !isAmount && /rate|price|cost per/.test(l);
  if (isRate) return `${kindOf(l) ?? 'supply'}Rate` as ColumnRole;
  if (isAmount) return `${kindOf(l) ?? 'supply'}Amount` as ColumnRole;
  if (/\bqty\b|quantit/.test(l)) return 'qty';
  if (/\b(sr|sor|ssr)\s*code\b/.test(l)) return 'srCode';
  if (/\b(sr|sor|ssr)\s*(ref|item|reference)|schedule of rates|\bsr\s*(page|pg)/.test(l)) return 'srRef';
  if (/descr|particular|item of work|name of (the )?(item|material|work|equipment)|specification/.test(l)) return 'description';
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

const usable = (m: Partial<Record<ColumnRole, number>>) => m.description !== undefined && (m.qty !== undefined || m.totalQty !== undefined);

function findHeader(rows: Cell[][]): { row: number; height: 1 | 2; map: Partial<Record<ColumnRole, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const single = mapColumns((rows[r] ?? []).map(text));
    const double = rows[r + 1] ? mapColumns(combinedLabels(rows[r] ?? [], rows[r + 1] ?? [])) : {};
    // A two-row header must start on a row that is itself part of the header, not a blank or title row.
    // A title merged across the table ("Supply of materials, Erection and Commissioning ... Amount in Rs.") is one
    // cell, not the top row of a header.
    const filled = (rows[r] ?? []).filter((c) => text(c) !== '').length;
    // The top row may hold only group titles ("Supply of Materials | Errection Charges") over "Unit Rate | Amount".
    const groupTitles = (rows[r] ?? []).filter((c) => kindOf(norm(text(c))) !== null).length >= 2;
    if (filled >= 2 && (Object.keys(single).length > 0 || groupTitles) && usable(double) && Object.keys(double).length > Object.keys(single).length) return { row: r, height: 2, map: double };
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

const TOTAL_ROW = /^(sub[\s-]*tot[ao]l|tot[ao]l|grand\s*total|gross\s*total|carried\s*(over|forward)|brought\s*forward|c\s*\/\s*f|b\s*\/\s*f)\b/i;
const SUB_ITEM = /^\(?([a-z]|[ivx]{1,4})\)?[.)]?$/i;
const SUMMARY_SHEET = /abstract|abstarct|abstact|summary|cover|index|contents|\babs\b|\bgabs?\b|gab_|general\s*abs|^\s*[sd]ab\s*$|(^|[\s_])ab_/i;
/** Sheets that work out quantities for a BOQ sheet (foundation take-offs, trenches, compensation). */
const ANNEXURE_SHEET = /annex|calculation|calcu|\bcal|compensation|compansation|measurement|trench|\broad\b|drain|shelter|\b7th\b|sche?dule|shedule|\bpert\b|\bpag\b|face\s*sheet|facing\s*sheet|report|statu?atory/i;
const MISC_ROW = /^(misc|unforeseen|rounding|round off)/i;
/** "1/6.907289" in a "No/MT" column: count and tonnage. */
const NO_MT = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/;

/** BOQ part a sheet's items belong to, from its name. KPTCL workbooks name them "SS Civil", "Line Supply" etc. */
export function sectionOfSheet(name: string): EstimateSection | undefined {
  const n = name.toLowerCase();
  if (/dismantl|decommission|releas|^\s*\d*\s*dis\b|^\s*dis[\s_-]*(est|lab|ab)/.test(n)) return 'dismantling';
  const line = /\bline\b|\btl\b|lilo|tower/.test(n);
  if (/civil/.test(n)) return line ? 'lineCivil' : 'civil';
  if (line) return 'line';
  if (/supply|erection|electrical|\bss\b|station|material/.test(n)) return 'electrical';
  return undefined;
}

export function kindOfSheet(name: string): 'boq' | 'abstract' | 'annexure' {
  if (SUMMARY_SHEET.test(name)) return 'abstract';
  if (ANNEXURE_SHEET.test(name)) return 'annexure';
  return 'boq';
}

/**
 * A row such as "1 2 3 4 5 6" or "a b c d e f=dxe" under the header that only numbers or letters the columns.
 * Only the table's own columns count: notes to the right of the table (weights, remarks) don't make it an item.
 */
const isColumnNumbering = (cells: Cell[], columns: number[]) => {
  const filled = columns.map((c) => text(cells[c])).filter((t) => t !== '');
  if (filled.length < 3) return false;
  // "6=4x5" numbers a column and says how it is worked out.
  const lead = filled.map((t) => /^(\d+)(?:\.0+)?(\s*=\s*[\d\sx×*+().-]+)?$/i.exec(t));
  // Strictly rising, allowing a gap where a column (e.g. "Unit weight") is not one the table maps.
  if (lead.every((m, i) => m && (i === 0 || Number(m[1]) > Number(lead[i - 1]![1])) && Number(m[1]) <= Number(lead[0]![1]) + i + 3)) return true;
  return filled.every((t) => /^[a-z]{1,2}(\s*=\s*[a-z0-9 x×*+().-]+)?$/i.test(t)) && filled.some((t) => /^[a-z]$/i.test(t));
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const CIVIL_ITEM = /excavat|earth\s*work|concrete|plaster|brick|masonry|reinforcement|centering|shuttering|refilling|filling|embankment|metal spreading|jelly|flooring|paint|water\s*proof|pcc|rcc|culvert|drain/i;
const LINE_TITLE = /conductor|stringing|\blilo\b|tapped line|(2nd|second) circuit|line strengthening|strengthening of|line work|transmission line|tower/i;
const BAY_TITLE = /terminal bay|line bay|\bbay\b|sub[\s-]*station|receiving station|\bmuss\b|power transformer|\bmva\b/i;

/**
 * BOQ part of a sheet whose name does not say ("Sheet1", "Part-A", "D Belavangala Supply&Erection"): read from the
 * title rows above the table and from what the items are. A sheet of excavation and concrete is civil work; a
 * sheet titled for a conductor or line job is line work; a dismantling title makes it dismantling.
 */
export function sectionOfContent(title: string, descriptions: string[]): EstimateSection | undefined {
  const civil = descriptions.length >= 3 && descriptions.filter((d) => CIVIL_ITEM.test(d)).length / descriptions.length >= 0.5;
  // Substation equipment (CTs, breakers, isolators) is not line work, whatever line the title names.
  const equipment = descriptions.filter((d) => /current\s+transformer|\bcts?\b|circuit\s+breaker|isolator|relay\s+panel|surge\s+arrest|power\s+transformer/i.test(d)).length;
  const station = equipment > 0 && equipment / descriptions.length >= 0.25;
  const line = !station && ((LINE_TITLE.test(title) && !BAY_TITLE.test(title)) || descriptions.some((d) => /check survey|drone survey/i.test(d)));
  if (/dismantl|decommission/i.test(title) && !/supply|erection portion/i.test(title)) return 'dismantling';
  // A quantity-only BOQ has no title rows; its items still say what it is.
  if (descriptions.length >= 2 && descriptions.filter((d) => /dismantl|releas|decommission/i.test(d)).length / descriptions.length >= 0.3) return 'dismantling';
  if (/civil/i.test(title) || civil) return line ? 'lineCivil' : 'civil';
  if (line) return 'line';
  return undefined;
}

/**
 * The material SoR item code written in a remarks cell beside the table, e.g. "(Common SR 2023-24, Material:SL No:5.2.11,
 * Pg No:31 Erection:SL No:14 a …)" → "5.2.11". Only the material code of the KPTCL common SR is taken; civil (KPWD SR)
 * references number their items differently.
 */
export function srCodeInRemarks(cells: Cell[], col: Partial<Record<ColumnRole, number>>): string | undefined {
  const mapped = new Set(Object.values(col));
  for (let c = 0; c < cells.length; c++) {
    if (mapped.has(c)) continue;
    const t = text(cells[c]);
    if (!/(common|uni|kptcl)\s*sr|material\s*:/i.test(t) || /kpwd|escom/i.test(t)) continue;
    const m = /material\s*:?\s*(?:(?:common|uni)\s*sr[^,\]]*,\s*)?(?:pg\.?\s*no\.?\s*[:-]?\s*\d+\s*,\s*)?sl\.?\s*no\.?\s*[:.-]?\s*(\d+(?:\.\d+)+)/i.exec(t);
    if (m) return m[1];
    if (/material|erection/i.test(t)) continue;
    const plain = /sl\.?\s*no\.?\s*[:.-]?\s*(\d+(?:\.\d+)+)/i.exec(t);
    if (plain) return plain[1];
  }
  return undefined;
}

function parseSheet(sheet: SheetGrid, idPrefix: string) {
  const items: ParsedItem[] = [];
  const skipped: SkippedRow[] = [];
  const totals: TotalCheck[] = [];
  const misc: MiscRow[] = [];
  const kind = kindOfSheet(sheet.name);
  const summary: SheetSummary = { name: sheet.name, headerRow: null, columns: {}, includedByDefault: kind === 'boq', kind, section: sectionOfSheet(sheet.name) };
  const header = findHeader(sheet.rows);
  if (!header) {
    summary.note = 'No BOQ table found (needs a Description and a Quantity column)';
    return { items, skipped, totals, misc, summary };
  }
  const col = header.map;
  summary.headerRow = header.row + 1;
  summary.columns = Object.fromEntries(Object.entries(col).map(([k, c]) => [k, columnLetter(c)]));
  if (kind === 'abstract') summary.note = 'Looks like a summary sheet, so it starts excluded to avoid counting items twice';
  {
    const title = sheet.rows.slice(0, header.row).flatMap((cells) => cells.map(text)).filter(Boolean).join(' · ');
    const below = sheet.rows
      .slice(header.row + header.height)
      .map((cells) => (col.description === undefined ? '' : text(cells[col.description])));
    // Only the table: the certificate and report under the grand total talk about lines and stations alike.
    const end = below.findIndex((d) => /grand\s*total|^certificate/i.test(d));
    const descriptions = (end < 0 ? below : below.slice(0, end)).filter((d) => d.length > 8).slice(0, 60);
    const byContent = sectionOfContent(title, descriptions);
    // The name wins when it names a part outright (Civil, Line, Dismantling); a station name is only a hint.
    if (!summary.section || (summary.section === 'electrical' && byContent && !/\bss\b|station|\btb\b|bay/i.test(sheet.name))) summary.section = byContent ?? summary.section;
  }
  if (kind === 'annexure') summary.note = 'Looks like an annexure that works out quantities for another sheet, so it starts excluded';

  const hidden = new Set(sheet.hiddenRows ?? []);
  const get = (cells: Cell[], role: ColumnRole) => (col[role] === undefined ? null : (cells[col[role]!] ?? null));
  let heading = '';
  /** The last top-level heading ("A3 Fabrication and supply of towers") and the sub-heading under it ("A) Tower type DC"). */
  let groupHeading = '';
  let subHeading = '';
  let sinceLastTotal: ParsedItem[] = [];
  const KINDS = ['supply', 'erection', 'testing'] as const;
  const miscSince = { supply: 0, erection: 0, testing: 0 };
  const prevComputed = { supply: 0, erection: 0, testing: 0 };
  let pendingMisc: MiscRow[] = [];
  /** A total row was read since the last item. */
  let afterTotal = false;
  const seenCodes = new Map<string, ParsedItem>();

  for (let r = header.row + header.height; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] ?? [];
    const rowNo = r + 1;
    if (cells.every((c) => text(c) === '')) continue;
    if (isColumnNumbering(cells, Object.values(col))) {
      skipped.push({ sheet: sheet.name, row: rowNo, code: '', description: cells.map(text).filter(Boolean).join(' '), reason: 'Column numbering row', canInclude: false });
      continue;
    }

    const code = text(get(cells, 'code'));
    const description = text(get(cells, 'description'));
    // Line sheets give Quantity (towers), Unit weight and TOTAL Quantity (tonnes); the amounts are worked on the total.
    const totalQtyCell = get(cells, 'totalQty');
    const countCell = get(cells, 'qty');
    const useTotal = typeof totalQtyCell === 'number' || (typeof totalQtyCell === 'string' && readNumber(totalQtyCell, '').value !== null);
    const qtyCell = useTotal ? totalQtyCell : countCell;

    if (!description && TOTAL_ROW.test(text(get(cells, 'unit')))) {
      skipped.push({ sheet: sheet.name, row: rowNo, code, description: cells.map(text).filter(Boolean).join(' '), reason: 'Total row with no amounts', canInclude: false });
      continue;
    }
    if (TOTAL_ROW.test(description) || TOTAL_ROW.test(code)) {
      const grand = /grand|gross/i.test(description || code);
      const scope = grand ? items.filter((i) => i.sheet === sheet.name) : sinceLastTotal;
      const statesAmount = KINDS.some((k) => readNumber(get(cells, `${k}Amount`), 'Total').value !== null);
      if (!statesAmount) {
        // e.g. a tower "Sub Total" that only adds up numbers and tonnes; it doesn't close a section.
        skipped.push({ sheet: sheet.name, row: rowNo, code, description: description || code, reason: 'Total row with no amounts', canInclude: false });
        continue;
      }
      for (const kind of KINDS) {
        const stated = readNumber(get(cells, `${kind}Amount`), 'Total').value;
        if (stated === null) continue;
        const itemsSum = r2(scope.reduce((s, i) => s + (i.qty ?? 0) * i[`${kind}Rate`], 0));
        const miscAmount = grand ? misc.filter((m) => m.column === kind).reduce((s, m) => s + m.amount, 0) : miscSince[kind];
        // "Total" straight after "Sub-total" + "Miscellaneous" is the sub-total plus the misc amount.
        const computed = r2(!grand && sinceLastTotal.length === 0 && miscAmount !== 0 ? prevComputed[kind] + miscAmount : itemsSum + miscAmount);
        totals.push({ sheet: sheet.name, row: rowNo, label: description || code, column: kind, stated, computed });
        for (const m of pendingMisc) if (m.column === kind) m.statedTotal = stated;
        if (!grand) prevComputed[kind] = computed;
      }
      if (!grand) {
        sinceLastTotal = [];
        pendingMisc = [];
        Object.assign(miscSince, { supply: 0, erection: 0, testing: 0 });
      }
      skipped.push({ sheet: sheet.name, row: rowNo, code, description: description || code, reason: 'Total row', canInclude: false });
      afterTotal = true;
      continue;
    }

    if (text(qtyCell) === '' && (MISC_ROW.test(description) || MISC_ROW.test(code))) {
      let found = false;
      for (const kind of KINDS) {
        const amount = readNumber(get(cells, `${kind}Amount`), 'Miscellaneous').value;
        if (amount === null || amount === 0) continue;
        const m: MiscRow = { sheet: sheet.name, row: rowNo, label: description || code, column: kind, amount };
        misc.push(m);
        pendingMisc.push(m);
        miscSince[kind] += amount;
        found = true;
      }
      if (found) {
        skipped.push({ sheet: sheet.name, row: rowNo, code, description: description || code, reason: 'Miscellaneous amount, carried to the estimate', canInclude: false });
        continue;
      }
    }

    // A lump-sum line ("L/S") can have an amount but no quantity: it is read as 1 × the amount.
    const lsWord = /^(l\s*[./]?\s*s\.?|lump\s*-?\s*sum|job|lot)$/i.test(text(qtyCell));
    const lumpSum = (text(qtyCell) === '' || lsWord) && Boolean(description) && KINDS.some((k) => (readNumber(get(cells, `${k}Amount`), 'Amount').value ?? 0) !== 0);
    if (text(qtyCell) === '' && !lumpSum) {
      if (description) heading = description;
      if (description && (/^[A-Z]{1,2}\s*-?\s*\d+/.test(code) || /^\d+(\.0)?$/.test(code))) {
        groupHeading = description;
        subHeading = '';
      } else if (description) subHeading = description;
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

    const priced = (['supplyRate', 'erectionRate', 'testingRate', 'supplyAmount', 'erectionAmount', 'testingAmount'] as const).some((r) => typeof get(cells, r) === 'number' && get(cells, r) !== 0);
    // Figures with no description below a table's closing total (working left there, "#REF!" leftovers) are not an
    // item. Straight under an item they are part of it (the bolts and nuts of a structure), handled further down.
    if (!description && !code && (afterTotal || !priced || items.length === 0)) {
      skipped.push({ sheet: sheet.name, row: rowNo, code, description: cells.map(text).filter(Boolean).join(' '), reason: 'Figures with no description, code or unit', canInclude: false });
      continue;
    }
    if (!description && !priced) {
      // e.g. "1.SSY Type-2 Cable duct | 5.00 m" listed under the table: a note, nothing priced.
      skipped.push({ sheet: sheet.name, row: rowNo, code, description: cells.map(text).filter(Boolean).join(' '), reason: 'No description and nothing priced (a note)', canInclude: false });
      continue;
    }
    // A note row under the table ("Excavation | cmtr", a column letter "d"): a quantity cell holding a word and
    // nothing priced on the row. It is not an item with a broken quantity. "LS" with no amount is an item still to be priced.
    if (typeof qtyCell === 'string' && !/\d/.test(qtyCell) && !/^#/.test(qtyCell.trim()) && !lsWord && !priced) {
      if (description) heading = description;
      skipped.push({ sheet: sheet.name, row: rowNo, code, description: description || cells.map(text).filter(Boolean).join(' '), reason: `Quantity column reads “${text(qtyCell)}” (a note, not a quantity)`, canInclude: Boolean(description) });
      continue;
    }

    const issues: Issue[] = [];
    const noMt = NO_MT.exec(text(qtyCell));
    const tonnes = noMt ? Number(noMt[2]) : null;
    const qty: NumberRead = lumpSum ? { value: 1 } : noMt ? { value: Number(noMt[1]) } : readNumber(qtyCell, 'Quantity');
    if (lumpSum) issues.push({ level: 'warning', field: 'qty', message: lsWord ? `Quantity “${text(qtyCell)}”: read as a lump sum, quantity 1` : 'No quantity in the file, but an amount: read as a lump sum, quantity 1' });
    if (qty.issue) issues.push({ ...qty.issue, field: 'qty' });
    let qtyValue = qty.value;
    if (qtyValue !== null && qtyValue < 0) {
      issues.push({ level: 'error', field: 'qty', message: `Quantity ${qtyValue} is negative` });
      qtyValue = null;
    } else if (qtyValue === 0) {
      issues.push({ level: 'warning', field: 'qty', message: 'Quantity is 0' });
    }

    let unit = text(get(cells, 'unit'));
    const count = readNumber(countCell, '').value;
    if (useTotal && /^no'?s?\.?\s*\/\s*mt$/i.test(unit.replace(/\s+/g, ''))) {
      // "No/MT" with a separate total: priced per MT on the total tonnage.
      unit = count !== null ? `MT (${count} No)` : 'MT';
      issues.push({ level: 'warning', field: 'qty', message: `Quantity read from TOTAL Quantity: ${qtyValue} MT${count !== null ? ` for ${count} No` : ''}` });
    }
    if (noMt) {
      issues.push({ level: 'warning', field: 'qty', message: `Quantity “${text(qtyCell)}” read as ${noMt[1]} No weighing ${noMt[2]} MT` });
      unit = `No (${noMt[2]} MT)`;
    }
    if (!unit && qty.trailing && /^[a-z. ]{1,12}$/i.test(qty.trailing)) unit = qty.trailing;
    if (!unit) issues.push({ level: 'warning', field: 'unit', message: 'No unit' });
    let itemDescription = description;
    if (!description) {
      // A priced row with no description or item number under an item (the bolts and nuts of a structure, in tonnes) belongs to it.
      const above = items.at(-1);
      if (!code && above && above.sheet === sheet.name) {
        itemDescription = `${above.description} (contd.)`;
        issues.push({ level: 'warning', field: 'description', message: `No description: read as part of the item above (row ${above.row})` });
      } else issues.push({ level: 'error', field: 'description', message: 'No description' });
    }

    const rates = { supply: 0, erection: 0, testing: 0 };
    for (const kind of ['supply', 'erection', 'testing'] as const) {
      if (lumpSum) {
        // Only the amounts count on a lump-sum row; its rate cells hold whatever helped work the amount out.
        rates[kind] = readNumber(get(cells, `${kind}Amount`), 'Amount').value ?? 0;
        continue;
      }
      const read = readNumber(get(cells, `${kind}Rate`), `${kind[0]!.toUpperCase()}${kind.slice(1)} rate`);
      // A rate that can't be read is left blank (the BOQ then shows "Rate needed"), so it is a warning, not a blocker.
      if (read.issue) issues.push({ level: 'warning', field: 'rate', message: read.issue.level === 'error' ? `${read.issue.message}; left blank` : read.issue.message });
      if (read.value !== null && read.value < 0) issues.push({ level: 'warning', field: 'rate', message: `${kind[0]!.toUpperCase()}${kind.slice(1)} rate ${read.value} is negative; left blank` });
      else if (read.value !== null && read.issue?.level !== 'error') rates[kind] = read.value;

      const amount = readNumber(get(cells, `${kind}Amount`), 'Amount').value;
      const label = `${kind[0]!.toUpperCase()}${kind.slice(1)}`;
      // A rate whose amount cell is blank while the row's other amounts are filled is left over from a copied row
      // (an "Installing insulator strings" line with the conductor's supply rate): the file's totals leave it out.
      const otherAmounts = KINDS.filter((k) => k !== kind).some((k) => (readNumber(get(cells, `${k}Amount`), 'Amount').value ?? 0) !== 0);
      if (col[`${kind}Amount`] !== undefined && text(get(cells, `${kind}Amount`)) === '' && otherAmounts && rates[kind] !== 0 && qtyValue) {
        issues.push({ level: 'warning', field: 'rate', message: `${label} rate ${formatNumber(rates[kind])} has no ${kind} amount in the file, so it is left out, as in the file's totals` });
        rates[kind] = 0;
        continue;
      }
      if (tonnes !== null && qtyValue !== null && read.value !== null && rates[kind] !== 0) {
        // A "No/MT" line can price supply per No and erection per MT; the amount in the file tells which.
        const perNo = amount !== null && Math.abs(qtyValue * read.value - amount) <= AMOUNT_TOLERANCE;
        const perMt = amount !== null && Math.abs(tonnes * read.value - amount) <= AMOUNT_TOLERANCE;
        if (perMt && !perNo) {
          rates[kind] = qtyValue === 0 ? 0 : (read.value * tonnes) / qtyValue;
          issues.push({ level: 'warning', field: 'rate', message: `${label} rate ${formatNumber(read.value)} is per MT; taken as ${formatNumber(r2(rates[kind]))} per No (${tonnes} MT ÷ ${qtyValue} No)` });
          continue;
        }
        if (amount === null) {
          issues.push({ level: 'warning', field: 'rate', message: `Can’t tell whether the ${kind} rate ${formatNumber(read.value)} is per No or per MT; taken per No` });
          continue;
        }
      }
      if (amount !== null && qtyValue !== null && read.value !== null) {
        const expected = r2(qtyValue * read.value);
        if (Math.abs(expected - amount) > AMOUNT_TOLERANCE) {
          // The sheet's own amount is what its totals and abstract use (e.g. a "× 0.48" in the formula), so it wins.
          if (qtyValue > 0) {
            rates[kind] = amount / qtyValue;
            issues.push({
              level: 'warning',
              field: 'amount',
              message: `${label} amount in the file is ${formatNumber(amount)}, but qty × rate is ${formatNumber(expected)}. The file’s amount is used (rate ${formatNumber(r2(rates[kind]))})`,
            });
          } else {
            issues.push({ level: 'warning', field: 'amount', message: `${label} amount in the file is ${formatNumber(amount)}, but the quantity is ${qtyValue}` });
          }
        }
      } else if (amount !== null && amount !== 0 && read.value === null && qtyValue) {
        // An amount with no rate (the rate was worked out off-sheet): keep the amount.
        rates[kind] = amount / qtyValue;
        issues.push({ level: 'warning', field: 'rate', message: `No ${kind} rate in the file, but an amount of ${formatNumber(amount)}; rate taken as ${formatNumber(r2(rates[kind]))}` });
      }
    }

    if (hidden.has(rowNo)) issues.push({ level: 'warning', field: 'row', message: 'This row is hidden in Excel' });

    const item: ParsedItem = {
      id: `${idPrefix}-${rowNo}`,
      sheet: sheet.name,
      row: rowNo,
      code,
      description: itemDescription,
      heading: SUB_ITEM.test(code) && heading ? heading : undefined,
      unit,
      qty: qtyValue,
      supplyRate: rates.supply,
      erectionRate: rates.erection,
      testingRate: rates.testing,
      srRef: text(get(cells, 'srRef')) || undefined,
      srCode: text(get(cells, 'srCode')) || srCodeInRemarks(cells, col) || undefined,
      group: [...new Set([groupHeading, subHeading].filter((h) => h && h !== description))].join(' · ') || undefined,
      issues,
    };
    if (code) {
      const key = `${item.heading ?? ''}|${code}`;
      const first = seenCodes.get(key);
      if (first) issues.push({ level: 'warning', field: 'row', message: `Item number ${code} also appears on row ${first.row}` });
      else seenCodes.set(key, item);
    }
    if (!SUB_ITEM.test(code) && description) heading = description;
    items.push(item);
    sinceLastTotal.push(item);
    afterTotal = false;
  }
  return { items, skipped, totals, misc, summary };
}

type AbstractKey = Exclude<keyof StatedAbstract, 'sheet' | 'part' | 'title' | 'areaLoadingPct' | 'gstPct'>;
/** Row labels of a KPTCL abstract, checked in this order (e.g. "Area loading on Basic rate" is loading, not basic). */
const ABSTRACT_LABELS: [AbstractKey, RegExp][] = [
  ['total', /total (estimated )?(cost of )?(the )?(estimate|estimte|project|work)|total estimate(d)? cost/],
  ['statutory', /statutory/],
  ['land', /\bland\b|corridor|tower[\s-]*foot/],
  ['loading', /area spec|loading/],
  ['gst', /\bgst\b/],
  ['basic', /basic/],
  ['forest', /forest|tree|crop/],
  ['material', /material/],
  ['labour', /labour|erection|dismantl/],
  ['civil', /civil/],
];

/** Reads the figures off an abstract sheet (material, labour, civil, basic, loading, GST, statutory, compensation, total). */
export function readAbstract(sheet: SheetGrid): StatedAbstract | null {
  const found: Partial<Record<AbstractKey, number>> = {};
  let firstLabelRow = -1;
  sheet.rows.forEach((cells, r) => {
    for (let c = 0; c < cells.length; c++) {
      const label = norm(text(cells[c]));
      if (!label || /^say\b/.test(label)) continue;
      const hit = ABSTRACT_LABELS.find(([, re]) => re.test(label));
      if (!hit) continue;
      if (found[hit[0]] === undefined) {
        const after = cells.slice(c + 1).map((v) => (typeof v === 'number' ? v : readNumber(v, '').issue ? null : readNumber(v, '').value));
        const value = after.find((v) => v !== null && v !== undefined);
        if (value !== undefined && value !== null) {
          found[hit[0]] = value;
          if (firstLabelRow < 0) firstLabelRow = r;
        }
      }
      break;
    }
  });
  if (found.basic === undefined || firstLabelRow < 0) return null;
  const titleCells = sheet.rows.slice(0, firstLabelRow).flatMap((cells) => cells.map(text)).filter(Boolean);
  // Most KPTCL abstracts state their amounts in lakhs ("Amount in Rs. Lakhs"); the figures here are kept in rupees.
  if (titleCells.some((t) => /lakh|lacs?\b/i.test(t))) {
    for (const k of Object.keys(found) as AbstractKey[]) found[k] = found[k]! * 1e5;
  }
  const title = titleCells.join(' · ');
  const name = sheet.name.toLowerCase();
  const all = `${title}`.toLowerCase();
  const part: StatedAbstract['part'] = /dismantl|decommission|^\s*dis\b|^\s*\d*\s*dis[\s_-]|^\s*dab\b/.test(name) || /\bdismantling of\b/.test(all)
    ? 'II'
    : /\b(ss|station|substation|sab|tb)\b/.test(name) || (BAY_TITLE.test(all) && !(LINE_TITLE.test(all) && !/bay/.test(all)))
      ? 'I'
      : /\bline\b|\btl\b|lilo/.test(name) || /\bline\b|lilo/.test(all)
        ? 'line'
        : 'I';
  const out: StatedAbstract = { sheet: sheet.name, part, title, ...found };
  if (found.loading !== undefined && found.basic) out.areaLoadingPct = r2((found.loading / found.basic) * 100);
  if (found.gst !== undefined && found.basic) out.gstPct = r2((found.gst / (found.basic + (found.loading ?? 0))) * 100);
  return out;
}

const isFullAbstract = (a: StatedAbstract) => a.basic !== undefined && a.total !== undefined && (a.material !== undefined || a.labour !== undefined) && a.gst !== undefined;

export function parseBoq(sheets: SheetGrid[], fileName: string, section: EstimateSection, now = new Date()): BoqReadResult {
  const result: BoqReadResult = { fileName, section, readAt: now.toISOString(), sheets: [], items: [], skipped: [], totals: [], misc: [], abstracts: [] };
  sheets.forEach((sheet, i) => {
    if (sheet.hidden) {
      result.sheets.push({ name: sheet.name, headerRow: null, columns: {}, includedByDefault: false, note: 'Hidden sheet, not read' });
      return;
    }
    const part = parseSheet(sheet, `s${i}`);
    // An abstract is known by its rows (basic rate, GST, total cost of estimate), whatever the sheet is called ("SAB", "Dis_AB").
    const stated = readAbstract(sheet);
    if (stated && (part.summary.kind === 'abstract' || isFullAbstract(stated))) {
      result.abstracts!.push(stated);
      if (part.summary.kind !== 'abstract') {
        part.summary.kind = 'abstract';
        part.summary.includedByDefault = false;
        part.summary.note = 'Abstract sheet, read for its totals and charges';
      }
    }
    result.sheets.push(part.summary);
    result.misc!.push(...part.misc);
    result.items.push(...part.items);
    result.skipped.push(...part.skipped);
    result.totals.push(...part.totals);
  });
  // An abstract that doesn't say "lakhs" is still in lakhs when its figures × 1,00,000 are the totals of the BOQ sheets.
  const sheetTotals = result.totals.map((t) => t.stated);
  for (const a of result.abstracts!) {
    if (/lakh|lacs?\b/i.test(a.title)) continue;
    const parts = [a.material, a.labour, a.civil].filter((v): v is number => v !== undefined && v > 0);
    const inLakhs = parts.length > 0 && parts.every((v) => v < 100_000) && parts.some((v) => sheetTotals.some((t) => Math.abs(t - v * 1e5) <= Math.max(1, t * 0.001)));
    if (inLakhs) for (const k of ['material', 'labour', 'civil', 'basic', 'loading', 'gst', 'statutory', 'forest', 'land', 'total'] as const) if (a[k] !== undefined) a[k] = a[k]! * 1e5;
  }
  // A line job (line sheets, no substation sheet): its civil work is line civil and its abstract is the line works abstract.
  const used = result.sheets.filter((s) => s.includedByDefault && s.headerRow);
  if (used.some((s) => s.section === 'line') && !used.some((s) => s.section === 'electrical')) {
    for (const s of used) if (s.section === 'civil') s.section = 'lineCivil';
    if (!result.abstracts!.some((a) => a.part === 'line')) for (const a of result.abstracts!) if (a.part === 'I') a.part = 'line';
  }
  // A substation job (no line sheets): an abstract titled after the line the bay serves is still Abstract-I.
  if (used.length && !used.some((s) => s.section === 'line' || s.section === 'lineCivil') && !result.abstracts!.some((a) => a.part === 'I')) {
    for (const a of result.abstracts!) if (a.part === 'line') a.part = 'I';
  }
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
