/**
 * The PDF format for the Abstract & Estimate, measured from KPTCL's printed estimate (the Gowdagere 2x20 MVA
 * station material estimate, 23 Nov 2026): Bookman Old Style on a US Letter page, the letterhead, project and
 * sheet title in three boxed rows, two-level column headings ("Supply of Material" over "Unit Rate / Amount"),
 * 6.73 pt table text on 8.76 pt rows and a 0.48 pt grid. Every user who has not changed a setting gets this
 * format; the editor changes it per DPR.
 */

export type BorderStyle = 'grid' | 'rows' | 'outer' | 'none';
export type Orientation = 'portrait' | 'landscape';
export type Paper = 'letter' | 'a4';

export interface SheetSettings {
  include?: boolean;
  orientation?: Orientation;
  /** Title printed above the table, in place of the standard one. */
  title?: string;
  /** Relative column widths, one per column; missing means the standard widths. */
  colWeights?: number[];
  /** Fixed row heights in points, by row index (-1 is the header row). */
  rowHeights?: Record<string, number>;
  /** Bold on or off per row index, overriding the Excel's. */
  bold?: Record<string, boolean>;
  /** Edited cell text, keyed "row:column" (row -1 is the header). */
  cells?: Record<string, string>;
  /** Edited project line under the letterhead. */
  note?: string;
  /** Column widths set on one page only, by page number within the sheet ("2"); other pages keep theirs. */
  pageColWeights?: Record<string, number[]>;
  /** Cells merged in the editor, by row index: [first, last] column pairs. They replace the Excel's merges for that row ([] unmerges it). */
  merges?: Record<string, [number, number][]>;
}

/** The settings a page can change for itself alone in the editor. */
export const PAGE_STYLE_KEYS = [
  'letterheadSize', 'projectSize', 'titleSize', 'headerSize', 'bodySize', 'lineSpacing', 'cellPadding', 'minRowHeight',
  'borders', 'innerLine', 'outerLine', 'headerFill', 'repeatHeader', 'justify', 'marginMm', 'topMm', 'bottomMm', 'showNotes', 'letterhead',
] as const;
export type PageStyle = Partial<Pick<PdfSettings, (typeof PAGE_STYLE_KEYS)[number]>>;

export interface PdfSettings {
  version: 2;
  paper: Paper;
  /** Letterhead lines on the first page of each sheet, each in its own boxed row. */
  letterhead: string[];
  /** The project name row under the letterhead. */
  showNotes: boolean;
  /** Left and right margin. */
  marginMm: number;
  topMm: number;
  bottomMm: number;
  letterheadSize: number;
  projectSize: number;
  /** The sheet title row ("Supply of station materials, erection and commissioning"). */
  titleSize: number;
  headerSize: number;
  bodySize: number;
  /** Line spacing as a multiple of the font size. */
  lineSpacing: number;
  /** Space between the text and the left and right cell borders. */
  cellPadding: number;
  minRowHeight: number;
  borders: BorderStyle;
  innerLine: number;
  outerLine: number;
  headerFill: boolean;
  repeatHeader: boolean;
  /** Paragraphs in the description column are justified, as in KPTCL's estimates. */
  justify: boolean;
  pageNumbers: boolean;
  /** No longer printed: the abstracts carry no signature block. Kept so older saved settings still read. */
  signatures?: string[];
  /** Each page's own changes, by page key ("Part A Electrical#2"), on top of the settings above. */
  pages?: Record<string, PageStyle>;
  sheets: Record<string, SheetSettings>;
  /** Sheet keys in print order; sheets not listed keep their place after these. */
  sheetOrder?: string[];
  /** Page keys ("sheet#n") in print order, after the sheet order; pages not listed follow in their natural place. */
  pageOrder?: string[];
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  version: 2,
  paper: 'letter',
  letterhead: ['KARNATAKA POWER TRANSMISSION CORPORATION LIMITED'],
  showNotes: true,
  marginMm: 7.43,
  topMm: 5.08,
  bottomMm: 19.05,
  letterheadSize: 10.1,
  projectSize: 9.02,
  titleSize: 7.81,
  headerSize: 6.73,
  bodySize: 6.73,
  lineSpacing: 1.3,
  cellPadding: 1.8,
  minRowHeight: 8.76,
  borders: 'grid',
  innerLine: 0.48,
  outerLine: 0.48,
  headerFill: false,
  repeatHeader: true,
  justify: true,
  pageNumbers: false,
  sheets: {},
};

/** Page sizes in points, portrait. */
export const PAPER: Record<Paper, { w: number; h: number; label: string }> = {
  letter: { w: 612, h: 792, label: 'Letter' },
  a4: { w: 595.28, h: 841.89, label: 'A4' },
};
export const MM = 72 / 25.4;

/** Sheets with many amount columns read better across the page. */
export const defaultOrientation = (columns: number): Orientation => (columns > 5 ? 'landscape' : 'portrait');

/**
 * Settings saved by an older version keep working: anything missing comes from the defaults. Settings from the
 * first (placeholder) format keep only the user's own text, sheet choices and order, so the KPTCL format applies.
 */
export function withDefaults(s: Partial<PdfSettings> | { version?: number } | null | undefined): PdfSettings {
  const saved = (s ?? {}) as Omit<Partial<PdfSettings>, 'version'> & { version?: number };
  if (saved.version === 1) {
    const sheets: Record<string, SheetSettings> = {};
    for (const [k, v] of Object.entries(saved.sheets ?? {})) {
      const { include, title, cells, note, bold } = v ?? {};
      sheets[k] = { include, title, cells, note, bold };
    }
    return { ...DEFAULT_PDF_SETTINGS, sheets, sheetOrder: saved.sheetOrder, pageOrder: saved.pageOrder };
  }
  return { ...DEFAULT_PDF_SETTINGS, ...saved, version: 2, sheets: { ...(saved.sheets ?? {}) } };
}

/** Signatures go under the abstracts, where KPTCL's estimates carry them. */
export const isAbstract = (key: string) => /abstract/i.test(key);

/** The sheet titles KPTCL prints, by worksheet name; other sheets keep the Excel's title. */
export const SHEET_TITLES: Record<string, string> = {
  'General Abstract': 'General Abstract (Rs. in lakhs)',
  'Part A Electrical': 'Supply of station materials, erection and commissioning',
  'Part B Civil': 'Civil works',
  'Line Supply': 'Supply of line materials, erection and commissioning',
  'Line Civil': 'Civil works for the line',
  Dismantling: 'Dismantling works',
};

export interface Heading {
  text: string;
  /** Spanning heading printed above this and the neighbouring columns with the same group. */
  group?: string;
}

const RATE = 'Unit Rate\n(in Rs.)';
const AMOUNT = 'Amount\n(in Rs.)';
/** The Excel's column headings, keyed in lower case, as KPTCL words them. */
const HEADINGS: Record<string, Heading> = {
  'sl. no.': { text: 'Sl No.' },
  'name of the equipment / materials': { text: 'Name of the Equipment/Materials' },
  qty: { text: 'Quantity' },
  'supply unit price': { text: RATE, group: 'Supply of Material' },
  'supply total': { text: AMOUNT, group: 'Supply of Material' },
  'material unit rate': { text: RATE, group: 'Supply of Material' },
  'material amount': { text: AMOUNT, group: 'Supply of Material' },
  'erection unit rate': { text: RATE, group: 'Erection charges' },
  'erection amount': { text: AMOUNT, group: 'Erection charges' },
  'labour unit rate': { text: RATE, group: 'Erection charges' },
  'labour amount': { text: AMOUNT, group: 'Erection charges' },
  't&c unit rate': { text: RATE, group: 'Testing and Commissioning' },
  't&c amount': { text: AMOUNT, group: 'Testing and Commissioning' },
  'basic rate': { text: RATE },
  rate: { text: RATE },
  amount: { text: AMOUNT },
  'amount (rs. lakhs)': { text: 'Amount\n(Rs. in lakhs)' },
};

export const heading = (excel: string): Heading => HEADINGS[excel.trim().toLowerCase()] ?? { text: excel };

/** Labels of the closing rows of a BOQ sheet, as KPTCL words them. */
const TOTAL_LABELS: Record<string, string> = {
  'sub total': 'Sub Total',
  'miscellaneous and unforeseen': 'Miscellaneous and other unforeseen materials',
  miscellaneous: 'Miscellaneous and other unforeseen materials',
  total: 'Grand Total',
  'total amount': 'Grand Total',
};
export const totalLabel = (excel: string) => TOTAL_LABELS[excel.trim().toLowerCase()] ?? excel;

/** The project row: the DPR's name without the app's id in brackets (an id has a digit; "(Coyote)" is part of a name). */
export const projectLine = (note: string) => note.replace(/\s*\((?=[^()\s]*\d)[^()\s]+\)\s*$/, '').trim();

/** The abstracts (general abstract, Abstract-I, the line works abstract, Abstract-II), which print in KPTCL's abstract layout. */
export const isPartAbstract = (key: string) => /^(General Abstract|Abstract-I|Abstract-II|Line Abstract)$/.test(key);

/**
 * KPTCL's abstract page, measured from the Jangamakote LILO abstract (25 Nov 2026) in points at Excel's 100%: Bookman
 * 16 pt letterhead, 14 pt estimate name, 12 pt "ABSTRACT", headings and rows; lines 1.27 x the text size apart; a row is its
 * lines plus 11 pt (one line 26.3 pt, two lines 41.6 pt); columns 50.5 / 496.6 / 125.2 pt; a medium outer frame around
 * the page block and thin lines inside. The page scales it to the table width, as Excel's fit-to-page print does.
 */
export const ABSTRACT_STYLE = {
  widths: [50.5, 496.6, 125.2],
  letterhead: { size: 16.4, extra: 10.2 },
  project: { size: 14.5, extra: 8.6 },
  title: { size: 12, extra: 11.06 },
  header: { size: 12, extra: 11.06 },
  body: { size: 12, extra: 11.06 },
  lineStep: 1.27,
  padLeft: 3.4,
  padRight: 1.9,
  /** The outer frame is Excel's medium border: twice the thin inner lines. */
  outerToInner: 2,
};

export type ColumnRole = 'sl' | 'desc' | 'unit' | 'qty' | 'money';

export function columnRole(excelHeader: string, index: number): ColumnRole {
  const h = excelHeader.trim().toLowerCase();
  if (index === 0) return 'sl';
  if (h === 'unit') return 'unit';
  if (/^(qty|quantity)/.test(h)) return 'qty';
  if (index === 1) return 'desc';
  return 'money';
}

/** Column widths in points on KPTCL's sheet: Sl No, Unit, Quantity and each rate/amount pair; the description takes the rest. */
const FIXED: Record<Exclude<ColumnRole, 'desc' | 'money'>, number> = { sl: 25.32, unit: 27.36, qty: 37.56 };
const MONEY = [62.52, 69.12, 50.88, 59.28, 50.88, 52.56];

/** Standard widths for a sheet's columns in points, scaled down if the table is narrower than they need. */
export function standardWidths(headers: string[], tableWidth: number): number[] {
  let money = 0;
  const roles = headers.map(columnRole);
  // An abstract's single amount column gets the width of an amount column.
  const singleMoney = roles.filter((r) => r === 'money').length === 1;
  const w = roles.map((r) => (r === 'desc' ? 0 : r === 'money' ? (singleMoney ? MONEY[1]! : MONEY[money++] ?? 60) : FIXED[r]));
  const fixed = w.reduce((a, b) => a + b, 0);
  const di = roles.indexOf('desc');
  if (di >= 0 && fixed < tableWidth * 0.8) {
    w[di] = tableWidth - fixed;
    return w;
  }
  if (di >= 0) w[di] = tableWidth * 0.3;
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / sum) * tableWidth);
}
