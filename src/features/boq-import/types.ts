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
  note?: string;
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
  | 'testingAmount';

export interface BoqReadResult {
  fileName: string;
  section: EstimateSection;
  readAt: string;
  sheets: SheetSummary[];
  items: ParsedItem[];
  skipped: SkippedRow[];
  totals: TotalCheck[];
  /** Set when the file could not be read at all. */
  failure?: string;
}
