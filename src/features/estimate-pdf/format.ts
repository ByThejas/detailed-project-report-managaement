/**
 * The PDF format for the Abstract & Estimate. This is a placeholder in the KPTCL style until the
 * department's standard format is supplied: swap the defaults here (letterhead, fonts, borders,
 * signatures) and every user who has not changed a setting gets the new format.
 */

export type BorderStyle = 'grid' | 'rows' | 'outer' | 'none';
export type Orientation = 'portrait' | 'landscape';

export interface SheetSettings {
  include?: boolean;
  orientation?: Orientation;
  /** Title printed above the table, in place of the Excel's. */
  title?: string;
  /** Relative column widths, one per column; missing means the Excel's widths. */
  colWeights?: number[];
  /** Fixed row heights in points, by row index (-1 is the header row). */
  rowHeights?: Record<string, number>;
  /** Bold on or off per row index, overriding the Excel's. */
  bold?: Record<string, boolean>;
  /** Edited cell text, keyed "row:column" (row -1 is the header). */
  cells?: Record<string, string>;
  /** Edited project line under the letterhead. */
  note?: string;
}

export interface PdfSettings {
  version: 1;
  /** Letterhead lines on the first page of each sheet. */
  letterhead: string[];
  showNotes: boolean;
  marginMm: number;
  titleSize: number;
  headerSize: number;
  bodySize: number;
  /** Line spacing as a multiple of the font size. */
  lineSpacing: number;
  cellPadding: number;
  minRowHeight: number;
  borders: BorderStyle;
  innerLine: number;
  outerLine: number;
  headerFill: boolean;
  repeatHeader: boolean;
  pageNumbers: boolean;
  /** Signature titles printed under each abstract; empty for none. */
  signatures: string[];
  sheets: Record<string, SheetSettings>;
  /** Sheet keys in print order; sheets not listed keep their place after these. */
  sheetOrder?: string[];
  /** Page keys ("sheet#n") in print order, after the sheet order; pages not listed follow in their natural place. */
  pageOrder?: string[];
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  version: 1,
  letterhead: ['KARNATAKA POWER TRANSMISSION CORPORATION LIMITED'],
  showNotes: true,
  marginMm: 12,
  titleSize: 11,
  headerSize: 8.5,
  bodySize: 8.5,
  lineSpacing: 1.25,
  cellPadding: 3,
  minRowHeight: 14,
  borders: 'grid',
  innerLine: 0.5,
  outerLine: 1,
  headerFill: true,
  repeatHeader: true,
  pageNumbers: true,
  signatures: ['Assistant Engineer', 'Assistant Executive Engineer', 'Executive Engineer'],
  sheets: {},
};

/** A4 in points. */
export const A4 = { w: 595.28, h: 841.89 };
export const MM = 72 / 25.4;

/** Sheets with many amount columns read better across the page. */
export const defaultOrientation = (columns: number): Orientation => (columns > 5 ? 'landscape' : 'portrait');

/** Settings saved by an older version keep working: anything missing comes from the defaults. */
export function withDefaults(s: Partial<PdfSettings> | null | undefined): PdfSettings {
  return { ...DEFAULT_PDF_SETTINGS, ...(s ?? {}), sheets: { ...(s?.sheets ?? {}) } };
}

/** Signatures go under the abstracts, where KPTCL's estimates carry them. */
export const isAbstract = (key: string) => /abstract/i.test(key);
