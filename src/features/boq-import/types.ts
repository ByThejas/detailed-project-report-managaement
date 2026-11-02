import type { EstimateSection } from '@/features/preparation/types';

/** One worksheet cell after reading: a number, text, or empty. Excel errors come through as text like "#REF!". */
export type Cell = string | number | null;

export interface SheetGrid {
  name: string;
  hidden?: boolean;
  /** rows[r][c], 0-based. */
  rows: Cell[][];
  /** 1-based numbers of rows hidden in Excel. */
  hiddenRows?: number[];
}

export type IssueField = 'qty' | 'description' | 'unit' | 'rate' | 'amount' | 'row';

export interface Issue {
  level: 'error' | 'warning';
  field: IssueField;
  message: string;
}

export interface ParsedItem {
  id: string;
  sheet: string;
  /** 1-based row number in the sheet. */
  row: number;
  code: string;
  description: string;
  /** Description of the parent row for sub-items like "a)", shown before the description on import. */
  heading?: string;
  unit: string;
  /** null when the file had no readable quantity. */
  qty: number | null;
  supplyRate: number;
  erectionRate: number;
  testingRate: number;
  /** Schedule-of-rates reference written next to the item, e.g. "(V1/Pg15/2.2.3)". */
  srRef?: string;
  issues: Issue[];
}

export interface SkippedRow {
  sheet: string;
  row: number;
  code: string;
  description: string;
  reason: string;
  /** Rows with a description but no quantity can be brought into the review as items. */
  canInclude: boolean;
}

/** A "Total" row in the file compared with the sum of the items read above it. */
export interface TotalCheck {
  sheet: string;
  row: number;
  label: string;
  column: string;
  stated: number;
  computed: number;
}

export interface SheetSummary {
  name: string;
  /** 1-based header row, or null when no BOQ table was found. */
  headerRow: number | null;
  /** Column letter for each role found, e.g. { description: 'B', qty: 'E' }. */
  columns: Partial<Record<ColumnRole, string>>;
  /** Abstract/summary sheets repeat other sheets, so they start excluded. */
  includedByDefault: boolean;
  /** What the sheet is, from its name: a BOQ table, an abstract, or an annexure that feeds quantities to a BOQ sheet. */
  kind?: 'boq' | 'abstract' | 'annexure';
  /** BOQ part the sheet's items go to, from its name (e.g. "Line Civil" → line civil). Falls back to the document's part. */
  section?: EstimateSection;
  note?: string;
}

/** A "Miscellaneous" row: a lump amount that tops a sheet up to its stated total. */
export interface MiscRow {
  sheet: string;
  row: number;
  label: string;
  column: 'supply' | 'erection' | 'testing';
  amount: number;
  /** The total stated on the row after it (sub-total + misc), when there is one. */
  statedTotal?: number;
}

/** The figures an abstract sheet in the workbook states, Rs. Used to cross-check and to carry over percentages and charges. */
export interface StatedAbstract {
  sheet: string;
  /** Which abstract of the estimate this sheet is, guessed from its title. */
  part: 'I' | 'II' | 'line';
  title: string;
  material?: number;
  labour?: number;
  civil?: number;
  basic?: number;
  loading?: number;
  gst?: number;
  statutory?: number;
  forest?: number;
  land?: number;
  total?: number;
  /** loading ÷ basic, %, rounded to 2 decimals. */
  areaLoadingPct?: number;
  /** gst ÷ (basic + loading), %, rounded to 2 decimals. */
  gstPct?: number;
}

export type ColumnRole =
  | 'code'
  | 'description'
  | 'unit'
  | 'qty'
  | 'supplyRate'
  | 'erectionRate'
  | 'testingRate'
  | 'supplyAmount'
  | 'erectionAmount'
  | 'testingAmount'
  | 'srRef';

export interface BoqReadResult {
  fileName: string;
  section: EstimateSection;
  readAt: string;
  sheets: SheetSummary[];
  items: ParsedItem[];
  skipped: SkippedRow[];
  totals: TotalCheck[];
  /** Miscellaneous / rounding rows found under the BOQ tables. Older saved reads may not have it. */
  misc?: MiscRow[];
  /** Abstract sheets found in the workbook. Older saved reads may not have it. */
  abstracts?: StatedAbstract[];
  /** Set when the file could not be read at all. */
  failure?: string;
}
