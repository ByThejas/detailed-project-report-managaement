import type { BoqReadResult, Cell, SheetGrid } from '@/features/boq-import/types';
import { printable, type PdfColumn, type PdfRow, type PdfSheet } from './sheets';

/**
 * Where each sheet of an estimate goes in the final DPR. The order is the user's (25 Nov 2026): the general
 * abstract; station abstract, labour and material, civil; line abstract, labour and material, civil; UG abstract,
 * material, labour, civil; TB abstract, material and labour, civil; dismantling abstract, labour; then every other
 * sheet (calculations, compensation, 7th schedule …) in the workbook's own order. The PERT chart follows them.
 */
export const SLOTS = [
  'General Abstract',
  'Station Abstract',
  'Station labour and material',
  'Station civil',
  'Line Abstract',
  'Line labour and material',
  'Line civil',
  'UG Abstract',
  'UG Material',
  'UG Labour',
  'UG Civil',
  'TB Abstract',
  'TB Material and Labour',
  'TB Civil',
  'Dismantling Abstract',
  'Dismantling labour',
  'Other sheets',
] as const;
export const OTHER = SLOTS.length - 1;
/** Not printed with the estimates: the app makes its own PERT chart and BCR. */
export const SKIP = -1;

export type Part = 'station' | 'line' | 'ug' | 'tb' | 'dis';
type Kind = 'abstract' | 'material' | 'labour' | 'civil';

const words = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/** First row (of the first 30) with three or more text cells: the table's header. */
export function headerRowOf(g: SheetGrid): number {
  const hidden = new Set(g.hiddenRows ?? []);
  for (let r = 0; r < Math.min(g.rows.length, 30); r++) {
    if (hidden.has(r + 1)) continue;
    const texts = (g.rows[r] ?? []).filter((c) => typeof c === 'string' && c.trim() && !/^#/.test(c.trim())).length;
    if (texts >= 3) return r;
  }
  return -1;
}

/** The text rows above the table (or the first eight rows when it has none), without the KPTCL letterhead. */
export function titleRowsOf(g: SheetGrid): string[] {
  const h = headerRowOf(g);
  const end = h < 0 ? Math.min(g.rows.length, 8) : h;
  const out: string[] = [];
  for (let r = 0; r < end; r++) {
    const t = (g.rows[r] ?? []).map(words).filter((x) => x && !/^#/.test(x)).join(' ');
    if (t && !/^karn?a?taka\s+power\s+transmission/i.test(t)) out.push(t);
  }
  return out;
}

// What a sheet is, from its name. Names are short and often abbreviated: "SAB", "Dis_AB", "TB @ Jul Supp & Erec".
const N_SKIP = /\bpert\b|^\s*\d*\s*prt\b|\bbcr\b|cost[\s-]*benefit/;
const N_OTHER =
  /calcu|calcul|\bcal\b|[\s-]cal$|^cal[\s-]|hardware|compen|compan|\bcomp\b|\b7th\b|sche?dule|shedule|annex|\bpag\b|glance|report|face\s*sheet|facing|statu|tower\s*protection|measurement|\bfdn\b|\bfnd\b|^temp$|\bjb\b|\btake[\s-]*off|\bbom\b/;
const N_GA = /general\s*ab|^\s*\d*\s*gabs?\b|^\s*\d*\s*gab[\s_-]|^\s*\d*\s*g\.?\s*a\.?\s*b\.?$/;
const N_ABS = /(^|[^a-z])(abs?|abst|abstr\w*|abstar\w*|abstac\w*|abstaract\w*)([^a-z]|$)|^\s*\d*\s*[sdtf]abs?\b|abstract/;
const N_DIS = /dismantl|decommission|releas|^\s*\d*\s*dis\b|^\s*\d*\s*dis[\s_-]|^\s*\d*\s*dab\b|\bdis\s*(est|lab|ab)/;
const N_UG = /\bug\b|cable|under\s*ground/;
const N_TB = /\btb\b|^tb|tb[\s@_-]|terminal|\bbay\b/;
const N_LINE = /\bline\b|\btl\b|lilo|tower|\bckt\b/;
const N_STATION = /station|\bss\b|substation|\bsab\b|muss/;
const N_CIVIL = /civil/;
const N_LABOUR = /labou?r|erection|\berec\b/;

// What a sheet is, from its title rows (the line under the letterhead that names the sheet or the job).
const T_SKIP = /pert\s*chart|benefit\s*cost|cost\s*benefit/;
const T_OTHER = /compensation|compansation|calculation|project\s+at\s+(a\s+)?glance|credit\s+estimate|7th\s+schedule|hardware\s+(fitting\s+)?calculation|take[\s-]*off|\bcertificate\b/;
const T_GA = /general\s+abstr?a?r?c?t/;
const T_ABS = /\babstract\b|\babstarct\b|\babstact\b/;
const T_DIS = /dismantl|decommission/;
const T_UG = /under\s*ground|\bug\b\s*cable|u\.g\.?\s*cable/;
const T_TB = /terminal\s*bay/;
const T_LINE = /conductor|stringing|\blilo\b|tapped\s+line|(2nd|second|double|single)\s+circuit|\bckt\b|line\s+strengthening|strengthening\s+of|line\s+work|transmission\s+line|\btowers?\b|\bkms?\b/;
const T_LINE_WORD = /\bline\b/;
const T_STATION = /sub[\s-]*station|transformer|\bmva\b|receiving\s+station|\bmuss\b|\bcts?\b|current\s+transformer|\bbay\b/;
const T_CIVIL = /civil\s*(portion|works?|estimate)|line\s+civil|\bcivil\b/;
const T_LABOUR = /erection\s+charges|labou?r\s+charges|\blabou?r\b/;

function partOfName(n: string): Part | null {
  if (N_DIS.test(n)) return 'dis';
  if (N_UG.test(n)) return 'ug';
  if (N_TB.test(n)) return 'tb';
  if (N_LINE.test(n)) return 'line';
  if (N_STATION.test(n)) return 'station';
  return null;
}

function partOfTitle(t: string): Part | null {
  if (!t) return null;
  if (T_DIS.test(t)) return 'dis';
  if (T_UG.test(t)) return 'ug';
  // A title names its work first: "Providing a terminal bay … for the 2nd circuit" is a bay, "Stringing of the 2nd
  // circuit … with terminal bays" is line work, "Replacement of CTs … of the outgoing line bay" is station work.
  const at = (re: RegExp) => {
    const m = re.exec(t);
    return m ? m.index : Infinity;
  };
  const found = ([['tb', at(T_TB)], ['line', at(T_LINE)], ['station', at(T_STATION)]] as [Part, number][]).filter(([, i]) => i < Infinity).sort((a, b) => a[1] - b[1]);
  if (found.length) return found[0]![0];
  if (T_LINE_WORD.test(t)) return 'line';
  return null;
}

const slotOf = (part: Part, kind: Kind): number => {
  switch (part) {
    case 'station':
      return kind === 'abstract' ? 1 : kind === 'civil' ? 3 : 2;
    case 'line':
      return kind === 'abstract' ? 4 : kind === 'civil' ? 6 : 5;
    case 'ug':
      return kind === 'abstract' ? 7 : kind === 'civil' ? 10 : kind === 'labour' ? 9 : 8;
    case 'tb':
      return kind === 'abstract' ? 11 : kind === 'civil' ? 13 : 12;
    case 'dis':
      return kind === 'abstract' ? 14 : 15;
  }
};

export interface SheetPlace {
  name: string;
  /** Index into SLOTS, OTHER, or SKIP. */
  slot: number;
  /** Station, line, UG, TB or dismantling, for the slots that have one. */
  part?: Part;
  why: string;
}

/**
 * Sorts every visible sheet of one estimate workbook into SLOTS, from the workbook's own sheet names and title rows,
 * nothing job-specific. A title row shared by most sheets is the job's name ("Estimate for providing 66 kV terminal
 * bay at …"); it decides only for sheets whose name and own title don't. A sheet that still can't be told takes the
 * part of the sheets around it (an "Erection" sheet between "Supply Cable" and "Cable Civil" is UG).
 */
export function classifySheets(grids: SheetGrid[], fileName = '', read?: BoqReadResult): SheetPlace[] {
  const visible = grids.filter((g) => !g.hidden);
  const titles = new Map(visible.map((g) => [g.name, titleRowsOf(g)]));
  // The job's name: the long title row found on the most sheets.
  const counts = new Map<string, number>();
  for (const rows of titles.values()) for (const k of new Set(rows.filter((r) => r.length > 40).map(norm))) counts.set(k, (counts.get(k) ?? 0) + 1);
  const best = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const isJob = (row: string) => {
    if (!best) return false;
    const k = norm(row);
    const a = k.slice(0, 50);
    return k === best || (a.length >= 30 && (best.includes(a) || k.includes(best.slice(0, 50))));
  };
  const jobRow = best ? [...titles.values()].flat().find((r) => norm(r) === best) ?? '' : '';
  const jobPart = partOfTitle(jobRow.toLowerCase()) ?? partOfTitle(fileName.toLowerCase()) ?? partOfName(fileName.toLowerCase().replace(/\.[a-z]+$/, ''));

  const summary = (name: string) => read?.sheets.find((s) => s.name === name);
  const statedAbstract = (name: string) => read?.abstracts?.some((a) => a.sheet === name) ?? false;

  type Draft = { name: string; slot?: number; part?: Part | null; kind?: Kind; why: string; byName?: boolean; section?: string };
  const drafts: Draft[] = visible.map((g) => {
    const n = g.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const rows = titles.get(g.name) ?? [];
    const own = rows.filter((r) => !isJob(r)).join(' · ').toLowerCase();
    const all = rows.join(' · ').toLowerCase();
    const empty = g.rows.every((r) => (r ?? []).every((c) => !words(c)));
    if (empty) return { name: g.name, slot: SKIP, why: 'empty sheet' };
    if (N_SKIP.test(n) || T_SKIP.test(all.slice(0, 200))) return { name: g.name, slot: SKIP, why: 'PERT/BCR: the DPR prints its own' };
    if (N_GA.test(n) || T_GA.test(all)) return { name: g.name, slot: 0, why: 'general abstract' };
    if (N_OTHER.test(n) || T_OTHER.test(own)) return { name: g.name, slot: OTHER, why: 'other sheet' };
    const s = summary(g.name);
    if (s?.kind === 'annexure' && !statedAbstract(g.name)) return { name: g.name, slot: OTHER, why: 'annexure' };
    const hasItems = read?.items.some((i) => i.sheet === g.name) ?? false;
    const kind: Kind =
      statedAbstract(g.name) || (!hasItems && (N_ABS.test(n) || T_ABS.test(own) || s?.kind === 'abstract'))
        ? 'abstract'
        : N_CIVIL.test(n) || T_CIVIL.test(own) || s?.section === 'civil' || s?.section === 'lineCivil'
          ? 'civil'
          : (N_LABOUR.test(n) && !/supp|material/.test(n)) || (T_LABOUR.test(own) && !/supply/.test(own))
            ? 'labour'
            : 'material';
    const byName = partOfName(n);
    if (byName) return { name: g.name, part: byName, kind, why: 'sheet name', byName: true };
    const byTitle = partOfTitle(own);
    if (byTitle) return { name: g.name, part: byTitle, kind, why: 'sheet title' };
    return { name: g.name, part: null, kind, why: '', section: s?.section };
  });

  // Sheets with no part of their own: the neighbours' when both agree, else what their items are, else the job's
  // name, else the sheet before (or after) it.
  const known = drafts.map((d) => d.part ?? null);
  drafts.forEach((d, i) => {
    if (d.slot !== undefined || d.part) return;
    let p = i - 1;
    while (p >= 0 && drafts[p]!.slot === undefined && !known[p]) p--;
    let q = i + 1;
    while (q < drafts.length && drafts[q]!.slot === undefined && !known[q]) q++;
    const prev = p >= 0 ? known[p]! : null;
    const next = q < drafts.length ? known[q]! : null;
    if (prev && next && prev === next) [d.part, d.why] = [prev, 'sheets around it'];
    else if (d.section === 'dismantling') [d.part, d.why] = ['dis', 'its items'];
    else if (d.section === 'line' || d.section === 'lineCivil') [d.part, d.why] = ['line', 'its items'];
    else if (jobPart) [d.part, d.why] = [jobPart, 'job title'];
    else if (prev || next) [d.part, d.why] = [(prev ?? next)!, 'sheet next to it'];
    else [d.part, d.why] = ['station', 'default'];
  });
  // A terminal-bay workbook ("TB-est", "Station-Supply-TB", a file named for a terminal bay) whose sheets otherwise
  // name the substation: those sheets are the bay's too.
  const named = drafts.filter((d) => d.byName);
  const bayBook = !named.some((d) => d.part === 'station') && (named.some((d) => d.part === 'tb') || /terminal\s*bay|\btb\b/i.test(fileName));
  if (bayBook) for (const d of drafts) if (d.part === 'station') [d.part, d.why] = ['tb', `${d.why}; terminal-bay workbook`];
  return drafts.map((d) => (d.slot !== undefined ? { name: d.name, slot: d.slot, why: d.why } : { name: d.name, slot: slotOf(d.part!, d.kind!), part: d.part!, why: d.why }));
}

const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const cellOut = (v: Cell | undefined): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.abs(v) < 0.005) return '';
    return Number.isInteger(v) ? (Math.abs(v) >= 10000 ? inr0.format(v) : String(v)) : inr2.format(v);
  }
  const t = String(v).trim();
  return t === '#NO_RESULT' ? '' : printable(t);
};

/**
 * One sheet of the uploaded workbook as the PDF prints it: the title rows over the table, then every row from the
 * header down as the file has it (hidden and empty rows left out), so annexures, compensation statements and the
 * signature rows print as in the Excel. Null for a sheet with nothing to print.
 */
export function sheetFromGrid(g: SheetGrid, key: string, widths?: (number | null)[], merges?: string[]): PdfSheet | null {
  const hidden = new Set(g.hiddenRows ?? []);
  const h = headerRowOf(g);
  const titleRows = titleRowsOf(g);
  const project = titleRows.find((t) => t.length > 40) ?? '';
  const named = titleRows.filter((t) => t !== project);
  const title = named.join(' ').slice(0, 300) || g.name.trim();
  const start = h < 0 ? 0 : h;
  const body: string[][] = [];
  /** The Excel row (1-based) of each body row, to find the merges that start on it. */
  const bodyRows: number[] = [];
  let blank = 0;
  for (let r = start + (h < 0 ? 0 : 1); r < g.rows.length; r++) {
    if (hidden.has(r + 1)) continue;
    const cells = (g.rows[r] ?? []).map(cellOut);
    if (cells.every((t) => !t)) {
      if (++blank > 25) break;
      continue;
    }
    blank = 0;
    body.push(cells);
    bodyRows.push(r + 1);
  }
  const headerCells = h < 0 ? [] : (g.rows[h] ?? []).map(cellOut);
  // Columns that print: not hidden in Excel and with something in them (Excel's narrow spacer columns are left out).
  const width = Math.max(headerCells.length, ...body.map((r) => r.length), 0);
  const withText = Array.from({ length: Math.min(width, 400) }, (_, c) => c).filter((c) => widths?.[c] !== null && (headerCells[c] || body.some((r) => r[c])));
  // The table ends at a gap of five or more empty columns: what lies far to the right is working-out, not the sheet.
  const cols: number[] = [];
  for (const c of withText) {
    if (cols.length && c - cols.at(-1)! > 5) break;
    cols.push(c);
  }
  if (!cols.length) return null;
  // A text merged across several Excel columns ("Particulars" over B:E) leaves the columns right of it with no heading
  // and hardly anything in them: they join the column on their left, so the text gets the merged width.
  const groups: number[][] = [];
  for (const c of cols) {
    const used = body.filter((r) => r[c]).length;
    if (groups.length && !headerCells[c] && used <= Math.max(2, body.length * 0.2)) groups.at(-1)!.push(c);
    else groups.push([c]);
  }
  const header = groups.map((gr) => headerCells[gr[0]!] ?? '');
  const groupOf = new Map(groups.flatMap((gr, i) => gr.map((c) => [c, i] as const)));
  const merged = (merges ?? []).map(parseRange).filter((m): m is Range => !!m && m.c2 > m.c1);
  const rows: PdfRow[] = body.map((r, k) => {
    const cells = groups.map((gr) => gr.map((c) => r[c] ?? '').filter(Boolean).join(' '));
    const label = cells.find((t) => t) ?? '';
    const row: PdfRow = { cells, bold: /^(sub[\s-]*)?total|grand\s*total|^say\b/i.test(label) };
    const spans = merges ? spansOf(merged, bodyRows[k]!, groupOf) : guessSpan(cells, groups, widths);
    if (spans.length) row.spans = spans;
    return row;
  });
  const filled = new Array<number>(groups.length).fill(0);
  const numeric = new Array<number>(groups.length).fill(0);
  for (const row of rows)
    row.cells.forEach((t, i) => {
      if (!t) return;
      filled[i]!++;
      if (/^-?[\d,]+(\.\d+)?$/.test(t)) numeric[i]!++;
    });
  // Widths as in the Excel; without them, from the longest text (a long description gets the most room).
  const longest = groups.map((_g, i) => Math.max(header[i]!.length, ...rows.map((r) => Math.min(r.cells[i]!.length, 60))));
  const weights = groups.map((gr, i) => (widths ? gr.reduce((a, c) => a + (widths[c] ?? 8.43), 0) : Math.max(4, Math.min(longest[i]!, 50))));
  const columns: PdfColumn[] = header.map((text, i) => ({
    header: text,
    width: weights[i]!,
    align: i === 0 ? 'center' : filled[i]! > 0 && numeric[i]! / filled[i]! > 0.6 ? 'right' : 'left',
  }));
  return { key, title: printable(title), notes: project ? [printable(project)] : [], columns, rows, weights };
}

interface Range {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}
const colNo = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
/** "A14:K14" as 1-based rows and 0-based columns. */
function parseRange(ref: string): Range | null {
  const m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
  if (!m) return null;
  return { c1: colNo(m[1]!), r1: Number(m[2]), c2: colNo(m[3]!), r2: Number(m[4]) };
}

/** The printed columns an Excel row's merged cells cover, as [first, last] pairs of printed column indexes. */
function spansOf(merged: Range[], excelRow: number, groupOf: Map<number, number>): [number, number][] {
  const out: [number, number][] = [];
  for (const m of merged) {
    // Only merges within one row: a block over several rows (a value standing for a whole group of items) prints its
    // text in its first row, and the rows under it keep their own cells.
    if (m.r1 !== m.r2 || excelRow !== m.r1) continue;
    const idx = [];
    for (let c = m.c1; c <= m.c2; c++) if (groupOf.has(c)) idx.push(groupOf.get(c)!);
    if (!idx.length) continue;
    const from = Math.min(...idx);
    const to = Math.max(...idx);
    if (to > from && !out.some(([a, b]) => from <= b && to >= a)) out.push([from, to]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * For a file whose merges cannot be read (an old .xls): a row with one text, far too long for its column and nothing
 * to its right (a "Note: …" under the table), prints across the rest of the row, as such a note is merged in the Excel.
 */
function guessSpan(cells: string[], groups: number[][], widths?: (number | null)[]): [number, number][] {
  const filled = cells.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
  if (filled.length !== 1) return [];
  const i = filled[0]!;
  if (i >= cells.length - 1) return [];
  const chars = widths ? groups[i]!.reduce((a, c) => a + (widths[c] ?? 8.43), 0) : 12;
  return cells[i]!.length > Math.max(40, chars * 3) ? [[i, cells.length - 1]] : [];
}

/** The estimate sheets the app prints, by worksheet name, and where they go. */
const APP_SLOT: Record<string, number | 'abstract' | 'material' | 'civil'> = {
  'General Abstract': 0,
  'Abstract-I': 'abstract',
  'Part A Electrical': 'material',
  'Part B Civil': 'civil',
  'Line Abstract': 4,
  'Line Supply': 5,
  'Line Civil': 6,
  'Abstract-II': 14,
  Dismantling: 15,
};
/** The app sheet that already prints a part of the estimate. */
const SECTION_SHEET: Record<string, string> = { electrical: 'Part A Electrical', civil: 'Part B Civil', line: 'Line Supply', lineCivil: 'Line Civil', dismantling: 'Dismantling' };
const ABSTRACT_SHEET: Record<string, string> = { I: 'Abstract-I', line: 'Line Abstract', II: 'Abstract-II' };

export interface EstimateWorkbook {
  fileName: string;
  grids: SheetGrid[];
  /** The workbook read as a BOQ, to know which sheets' items and abstracts are in the app's estimate. */
  read: BoqReadResult;
  /** Excel column widths per sheet (characters; null for a hidden column), where the file gives them. */
  widths?: Record<string, (number | null)[]>;
  /** Merged cell ranges per sheet ("A14:K14"), where the file gives them. */
  merges?: Record<string, string[]>;
}

export interface PlacedSheet {
  sheet: PdfSheet;
  slot: number;
  /** Where it comes from: the app's estimate, or a workbook. */
  from: 'estimate' | string;
  /** The worksheet's name. */
  name: string;
}

/**
 * The estimate pages of the final DPR in the user's order. The app's own estimate sheets keep their place (they carry
 * the edits made in the app); every other visible sheet of the uploaded workbook (one the estimate doesn't already
 * print: annexures, compensation, a UG or TB sheet, the 7th schedule …) is printed from the file in its slot.
 * `appSheets` empty gives only the workbook's leftover sheets, for a DPR whose estimate PDF was supplied as a file.
 */
export function placeEstimateSheets(appSheets: PdfSheet[], workbooks: EstimateWorkbook[], opts: { appKeys?: string[] } = {}): PlacedSheet[] {
  const appKeys = new Set(opts.appKeys ?? appSheets.map((s) => s.key));
  // The app's station sheets are the TB or UG ones when that is what the workbook's station-part sheets are.
  const groups = new Map<Part, number>();
  const places = workbooks.map((wb) => classifySheets(wb.grids, wb.fileName, wb.read));
  workbooks.forEach((wb, w) => {
    for (const p of places[w]!) {
      const s = wb.read.sheets.find((x) => x.name === p.name);
      const imported = wb.read.items.some((i) => i.sheet === p.name);
      const sec = s?.section ?? wb.read.section;
      if (imported && (sec === 'electrical' || sec === 'civil') && p.part && p.part !== 'line' && p.part !== 'dis') groups.set(p.part, (groups.get(p.part) ?? 0) + 1);
    }
  });
  // Nothing imported from the workbooks: their own station, TB or UG sheets say it.
  if (!groups.size) for (const ps of places) for (const p of ps) if (p.part && p.part !== 'line' && p.part !== 'dis') groups.set(p.part, (groups.get(p.part) ?? 0) + 1);
  const group = [...groups.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'station';
  const out: (PlacedSheet & { order: number })[] = [];
  appSheets.forEach((sheet, i) => {
    const a = APP_SLOT[sheet.key];
    const slot = typeof a === 'number' ? a : a ? slotOf(group, a) : OTHER;
    out.push({ sheet, slot, from: 'estimate', name: sheet.key, order: i });
  });
  workbooks.forEach((wb, w) => {
    places[w]!.forEach((p, i) => {
      if (p.slot === SKIP) return;
      const s = wb.read.sheets.find((x) => x.name === p.name);
      const imported = wb.read.items.some((it) => it.sheet === p.name) && s?.includedByDefault !== false;
      const stated = wb.read.abstracts?.find((x) => x.sheet === p.name);
      const covered =
        (p.slot === 0 && appKeys.has('General Abstract')) ||
        (stated && appKeys.has(ABSTRACT_SHEET[stated.part]!)) ||
        (imported && appKeys.has(SECTION_SHEET[s?.section ?? wb.read.section]!));
      if (covered) return;
      const g = wb.grids.find((x) => x.name === p.name)!;
      const key = `${wb.fileName} › ${p.name}`.replace(/abstract/gi, 'Abs.');
      const sheet = sheetFromGrid(g, key, wb.widths?.[g.name], wb.merges?.[g.name]);
      if (sheet) out.push({ sheet, slot: p.slot, from: wb.fileName, name: p.name.trim(), order: 1000 * (w + 1) + i });
    });
  });
  return out.sort((a, b) => a.slot - b.slot || a.order - b.order).map(({ sheet, slot, from, name }) => ({ sheet, slot, from, name }));
}

/**
 * Column widths (null for a hidden column) and merged cell ranges of every sheet of an .xlsx, as Excel stores them.
 * Empty for an old .xls.
 */
export async function workbookLayout(buffer: ArrayBuffer): Promise<{ widths: Record<string, (number | null)[]>; merges: Record<string, string[]> }> {
  const widths: Record<string, (number | null)[]> = {};
  const merges: Record<string, string[]> = {};
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    wb.eachSheet((ws) => {
      const n = Math.min(ws.columnCount, 200);
      widths[ws.name] = Array.from({ length: n }, (_, i) => {
        const col = ws.getColumn(i + 1);
        return col.hidden || col.width === 0 ? null : (col.width ?? 8.43);
      });
      merges[ws.name] = ((ws.model as { merges?: string[] }).merges ?? []).slice();
    });
  } catch {
    // An .xls or a damaged file: widths come from the text.
  }
  return { widths, merges };
}

/** Column widths of every sheet of an .xlsx, as Excel stores them (null for a hidden column). Empty for an old .xls. */
export async function columnWidths(buffer: ArrayBuffer): Promise<Record<string, (number | null)[]>> {
  return (await workbookLayout(buffer)).widths;
}
