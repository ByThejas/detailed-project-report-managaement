import { withDefaults } from './format';
import { approxMeasure, layout } from './layout';
import type { PdfSheet } from './sheets';

const base = { ...withDefaults({}), sheetOrder: [], pageOrder: [] };
const item = (i: number) => ({ cells: [String(i), `Item ${i}`, 'No', '1', '10.00', '10.00'], bold: false });
const sheet = (rows: PdfSheet['rows']): PdfSheet => ({
  key: 'Part A Electrical',
  title: 'Part A',
  notes: [],
  columns: ['Sl. No.', 'Name of the equipment', 'Unit', 'Quantity', 'Unit Rate', 'Amount'].map((header) => ({ header, width: 10, align: 'left' as const })),
  rows,
});

describe('estimate PDF spacing', () => {
  it('gives a one-line row even space above and below its text', () => {
    const rowsOf = (rowPadding: number) => layout([sheet([item(1)])], { ...base, rowPadding }, approxMeasure)[0]!.table!.rows.find((r) => r.index === 0)!;
    const tight = rowsOf(0);
    const padded = rowsOf(2.2);
    expect(padded.h - tight.h).toBeCloseTo(4.4, 1);
  });

  it('never leaves the closing rows alone on a page, nor a heading at the foot of one', () => {
    const totals = ['Sub Total', 'Miscellaneous', 'Grand Total'].map((t) => ({ cells: ['', t, '', '', '', '100.00'], bold: true, total: true }));
    for (let n = 20; n < 90; n++) {
      const pages = layout([sheet([...Array.from({ length: n }, (_, i) => item(i + 1)), ...totals])], base, approxMeasure);
      for (const p of pages) expect(p.table!.rows.filter((r) => r.index >= 0).every((r) => r.index >= n)).toBe(false);
    }
    for (let n = 20; n < 90; n++) {
      const rows = Array.from({ length: n }, (_, i) => item(i + 1));
      rows.splice(n - 2, 0, { cells: ['A9', 'Hardwares', '', '', '', ''], bold: true });
      const pages = layout([sheet(rows)], base, approxMeasure);
      for (const p of pages.slice(0, -1)) expect(p.table!.rows.at(-1)!.index).not.toBe(n - 2);
    }
  });
});
