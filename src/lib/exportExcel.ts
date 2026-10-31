export interface ExcelColumn<T> {
  header: string;
  /** Column width in characters. */
  width: number;
  value: (row: T) => string | number;
}

interface ExportOptions<T> {
  fileName: string;
  sheetName: string;
  title: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  /** Extra lines printed under the title, e.g. the filters used. */
  notes?: string[];
}

export interface SheetSpec<T> {
  sheetName: string;
  title: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  notes?: string[];
}

/** Lets sheets with different row types share one workbook. */
export const sheet = <T,>(spec: SheetSpec<T>) => spec as unknown as SheetSpec<unknown>;

/** Builds a one-sheet .xlsx in the browser and starts the download. */
export function exportToExcel<T>({ fileName, ...spec }: ExportOptions<T>) {
  return exportWorkbook(fileName, [sheet(spec)]);
}

/** Builds an .xlsx workbook in the browser and starts the download. ExcelJS is loaded only when needed. */
export async function exportWorkbook(fileName: string, sheets: SheetSpec<unknown>[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DPR Manager';
  wb.created = new Date();

  for (const { sheetName, title, columns, rows, notes = [] } of sheets) {
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 2 + notes.length + 1 }] });
    ws.columns = columns.map((c) => ({ width: c.width }));
    ws.addRow([title]).font = { bold: true, size: 14 };
    for (const n of notes) ws.addRow([n]).font = { italic: true, color: { argb: 'FF64748B' } };
    ws.addRow([]);

    const header = ws.addRow(columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
      cell.alignment = { vertical: 'middle' };
    });

    for (const r of rows) {
      const row = ws.addRow(columns.map((c) => c.value(r)));
      row.alignment = { vertical: 'top', wrapText: true };
    }
    ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: columns.length } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
