import type { SheetGrid } from '@/features/boq-import/types';
import { withDefaults } from './format';
import { approxMeasure, layout } from './layout';
import { sheetFromGrid } from './workbookSheets';

const NOTE = 'Note:The Material Shown above is approximate Calculation, release materials will be returned to store as per the eactuls.';
const grid: SheetGrid = {
  name: '7th schedule',
  rows: [
    ['KARNATAKA POWER TRANSMISSION CORPORATION LIMITED'],
    ['Sl. No', 'Particulars', 'Unit', 'Quantity', 'Condition', 'Remarks'],
    [1, 'Coyote ACSR Conductor Pieces', 'MT', 12.85, 'Scrap', '37.79'],
    [2, 'Disc insulators', 'No', 1044, 'Scrap', 'Not furnished'],
    [NOTE],
  ],
};
const widths = [6, 40, 8, 8, 10, 14];

describe('merged cells in printed workbook sheets', () => {
  it('prints a note merged across the row in the Excel as one line across the table', () => {
    const s = sheetFromGrid(grid, 'k', widths, ['A5:F5', 'F3:F4'])!;
    expect(s.rows[2]!.spans).toEqual([[0, 5]]);
    // A merge over several rows is not spread over each of them.
    expect(s.rows[0]!.spans).toBeUndefined();
    const pages = layout([s], { ...withDefaults({}), sheetOrder: [], pageOrder: [] }, approxMeasure);
    const noteText = pages[0]!.ops.filter((o) => o.kind === 'text' && /Note:The|eactuls/.test(o.text));
    expect(noteText.length).toBe(1);
  });

  it('guesses the merge for an .xls, whose merges are not read', () => {
    expect(sheetFromGrid(grid, 'k', widths)!.rows[2]!.spans).toEqual([[0, 5]]);
    expect(sheetFromGrid(grid, 'k', widths, [])!.rows[2]!.spans).toBeUndefined();
  });

  it('merges and unmerges cells chosen in the editor', () => {
    const s = sheetFromGrid(grid, 'k', widths, [])!;
    const base = { ...withDefaults({}), sheetOrder: [], pageOrder: [] };
    const merged = layout([s], { ...base, sheets: { k: { merges: { '0': [[4, 5]] } } } }, approxMeasure);
    const row = merged[0]!.table!.rows.find((r) => r.index === 0)!;
    expect(row.spans).toEqual([[4, 5]]);
    // Both texts print once, across the two columns, with no line between them in that row.
    expect(merged[0]!.ops.some((o) => o.kind === 'text' && o.text.includes('Scrap 37.79'))).toBe(true);
    const x = merged[0]!.table!.xs[5]!;
    const crossing = merged[0]!.ops.filter((o) => o.kind === 'line' && o.x1 === x && o.x2 === x && o.y1 < row.y + row.h && o.y2 > row.y);
    expect(crossing).toEqual([]);
    const un = layout([{ ...s, rows: s.rows.map((r, i) => (i === 2 ? { ...r, spans: [[0, 5]] as [number, number][] } : r)) }], { ...base, sheets: { k: { merges: { '2': [] } } } }, approxMeasure);
    expect(un[0]!.table!.rows.find((r) => r.index === 2)!.spans).toBeUndefined();
  });
});
