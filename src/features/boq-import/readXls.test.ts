import { readFileSync } from 'node:fs';
import { xlsToGrids } from './readXls';
import { isReadableBoq, workbookToGrids } from './readWorkbook';

// fixtures/xls/sample.xls was made in ExcelJS and saved as Excel 97–2003 by LibreOffice. It has a
// 9000-character cell (split over CONTINUE records), Kannada text, formulas with number, text and
// error results, a merged cell, a hidden row and a hidden sheet.
const bytes = () => new Uint8Array(readFileSync('fixtures/xls/sample.xls')).buffer;

describe('old .xls workbooks', () => {
  it('reads text, numbers and saved formula results', () => {
    const [a, hidden] = xlsToGrids(bytes());
    expect(a!.name).toBe('Part A Electrical');
    expect(a!.rows[0]).toEqual(['Sl. No.', 'Description', 'Unit', 'Qty', 'Rate', 'Amount']);
    expect(a!.rows[1]).toEqual([1, 'Supply of 66 kV SF6 circuit breaker – 1250 A, 31.5 kA (outdoor)', 'Nos', 2, 1234567.89, 2469135.78]);
    expect(a!.rows[2]!.slice(1, 3)).toEqual(['ಕನ್ನಡ text and ₹ symbol', 'Set']);
    expect(a!.rows[3]![1]).toBe('x'.repeat(9000));
    // LibreOffice saves 0 as the result of a formula that gives text (Excel saves the text, which is read
    // too: checked cell for cell against the DB Pura estimate saved by Excel).
    expect(a!.rows[4]!.slice(1, 6)).toEqual([0, null, null, null, 2594137.28]);
    expect(a!.rows[5]![5]).toBe('#DIV/0!');
    expect(a!.rows[6]!.slice(3, 6)).toEqual([42, -7, 1e9]);
    expect(a!.rows[7]![1]).toBe('Merged heading');
    expect(a!.rows[7]![2] ?? null).toBeNull();
    expect(a!.hiddenRows).toEqual([9]);
    expect(a!.rows[408]).toEqual([399, 'repeated item 29', 'No', 399 * 0.1, 399]);
    expect(hidden).toMatchObject({ name: 'Hidden sheet', hidden: true, rows: [['only', 1]] });
  });

  it('is picked up by the normal workbook reader, and .xls files are accepted', async () => {
    expect((await workbookToGrids(bytes()))[0]!.rows[1]![5]).toBe(2469135.78);
    expect(['a.xls', 'a.XLSX', 'a.xlsm'].every(isReadableBoq)).toBe(true);
    expect(isReadableBoq('a.pdf')).toBe(false);
  });

  it('refuses a file that is not a workbook', () => {
    expect(() => xlsToGrids(new TextEncoder().encode('not a workbook').buffer as ArrayBuffer)).toThrow();
  });
});
