import type { EstimateSection } from '@/features/preparation/types';
import { parseBoq } from './parse';
import type { BoqReadResult, Cell, SheetGrid } from './types';

type ExcelValue = unknown;

/** Turns an ExcelJS cell value into a plain number or text. Formulas use their saved result. */
export function cellToPlain(value: ExcelValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('formula' in v || 'sharedFormula' in v) return v.result === undefined ? '#NO_RESULT' : cellToPlain(v.result);
    if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((t) => t.text).join('');
    if (typeof v.error === 'string') return v.error;
    if (typeof v.text === 'string') return v.text;
  }
  return String(value);
}

/** Reads every sheet of an .xlsx into grids. Merged cells keep their value only in the top-left cell. */
export async function workbookToGrids(buffer: ArrayBuffer): Promise<SheetGrid[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    const hiddenRows: number[] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (row.hidden) hiddenRows.push(r);
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        if (cell.isMerged && cell.master.address !== cell.address) {
          cells[c - 1] = null;
          return;
        }
        // ExcelJS drops a saved formula result of 0 from `value` but keeps it on the cell model.
        const value = cell.value as unknown;
        const modelResult = (cell.model as { result?: unknown } | undefined)?.result;
        const withResult =
          value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value) && (value as { result?: unknown }).result === undefined && modelResult !== undefined
            ? { ...(value as object), result: modelResult }
            : value;
        cells[c - 1] = cellToPlain(withResult);
      });
      rows[r - 1] = Array.from(cells, (c) => c ?? null);
    });
    sheets.push({ name: ws.name, hidden: ws.state !== 'visible', rows: Array.from(rows, (r) => r ?? []), hiddenRows });
  });
  return sheets;
}

export const isReadableBoq = (fileName: string) => /\.xlsx$/i.test(fileName);

/** Reads a BOQ workbook. Never throws: a file that can't be opened comes back with `failure` set. */
export async function readBoqWorkbook(buffer: ArrayBuffer, fileName: string, section: EstimateSection): Promise<BoqReadResult> {
  try {
    return parseBoq(await workbookToGrids(buffer), fileName, section);
  } catch {
    return {
      fileName,
      section,
      readAt: new Date().toISOString(),
      sheets: [],
      items: [],
      skipped: [],
      totals: [],
      misc: [],
      abstracts: [],
      failure: 'The file could not be opened as an Excel workbook. Save it as .xlsx in Excel and attach it again.',
    };
  }
}
