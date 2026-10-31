import ExcelJS from 'exceljs';
import { columnLetter, openErrors, parseBoq, readNumber, roleOf, warningsOf } from './parse';
import { readBoqWorkbook } from './readWorkbook';
import type { Cell } from './types';

const grid = (rows: Cell[][], name = 'Electrical') => [{ name, rows }];

describe('readNumber', () => {
  it('reads plain and Indian-grouped numbers exactly', () => {
    expect(readNumber(12, 'Qty')).toEqual({ value: 12 });
    expect(readNumber('3,12,47,000', 'Qty')).toEqual({ value: 31_247_000 });
    expect(readNumber(' 2.5 ', 'Qty')).toEqual({ value: 2.5 });
    expect(readNumber('Rs. 1,200', 'Rate')).toEqual({ value: 1200 });
  });

  it('flags anything it had to interpret, and refuses what it cannot read', () => {
    expect(readNumber('2 Nos', 'Quantity')).toMatchObject({ value: 2, trailing: 'Nos', issue: { level: 'warning' } });
    expect(readNumber('LS', 'Quantity')).toMatchObject({ value: null, issue: { level: 'error' } });
    expect(readNumber('2x3', 'Quantity')).toMatchObject({ value: null, issue: { level: 'error' } });
    expect(readNumber('#REF!', 'Quantity').issue?.message).toMatch(/Excel error #REF!/);
    expect(readNumber('#NO_RESULT', 'Quantity').issue?.message).toMatch(/no saved result/);
  });
});

describe('roleOf', () => {
  it.each([
    ['Sl. No.', 'code'],
    ['Description of item', 'description'],
    ['Particulars', 'description'],
    ['Unit', 'unit'],
    ['Qty', 'qty'],
    ['Quantity', 'qty'],
    ['Unit rate', 'supplyRate'],
    ['Supply Rate in Rs', 'supplyRate'],
    ['Erection rate', 'erectionRate'],
    ['T&C Rate', 'testingRate'],
    ['Supply Amount', 'supplyAmount'],
    ['Erection Amount', 'erectionAmount'],
  ])('%s -> %s', (label, role) => expect(roleOf(label)).toBe(role));

  it('names columns like Excel', () => {
    expect([0, 25, 26, 27].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB']);
  });
});

describe('parseBoq', () => {
  const header: Cell[] = ['Sl. No.', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount', 'Erection rate', 'Erection amount'];

  it('reads items, finds the header below a title and skips numbering, headings and totals', () => {
    const r = parseBoq(
      grid([
        ['BILL OF QUANTITIES — 66/11 kV KOGALI S/S'],
        [],
        header,
        [1, 2, 3, 4, 5, 6, 7, 8],
        ['A1', 'Power transformers', null, null],
        ['a', '20 MVA, 66/11 kV', 'Nos', 2, 31_247_000, 62_494_000, 215_836.4, 431_672.8],
        ['b', 'NIFPS', 'Set', 2, 1_141_635, 2_283_270, null, null],
        ['A2', '11 kV CT', 'Nos', 6, 56_870, 341_220, 989, 5_934],
        [null, 'Sub total', null, null, null, 65_118_490, null, 437_606.8],
      ]),
      'boq.xlsx',
      'electrical',
    );
    expect(r.failure).toBeUndefined();
    expect(r.sheets[0]).toMatchObject({ headerRow: 3, columns: { code: 'A', description: 'B', unit: 'C', qty: 'D', supplyRate: 'E' } });
    expect(r.items.map((i) => [i.code, i.qty, i.row])).toEqual([
      ['a', 2, 6],
      ['b', 2, 7],
      ['A2', 6, 8],
    ]);
    expect(r.items[0]).toMatchObject({ heading: 'Power transformers', unit: 'Nos', supplyRate: 31_247_000, erectionRate: 215_836.4, issues: [] });
    expect(r.items[2]!.heading).toBeUndefined();
    expect(r.skipped.map((s) => s.reason)).toEqual(['Column numbering row', 'No quantity (heading or note)', 'Total row']);
    expect(r.totals).toEqual([
      { sheet: 'Electrical', row: 9, label: 'Sub total', column: 'supply', stated: 65_118_490, computed: 65_118_490 },
      { sheet: 'Electrical', row: 9, label: 'Sub total', column: 'erection', stated: 437_606.8, computed: 437_606.8 },
    ]);
  });

  it('reads a two-row header where "Supply" and "Erection" sit over Rate and Amount', () => {
    const r = parseBoq(
      grid([
        ['Sl No', 'Description', 'Unit', 'Qty', 'Supply', null, 'Erection', null],
        [null, null, null, null, 'Rate', 'Amount', 'Rate', 'Amount'],
        ['1', 'Isolator', 'Set', 2, 51_675, 103_350, 1_214, 2_428],
      ]),
      'b.xlsx',
      'electrical',
    );
    expect(r.sheets[0]!.columns).toMatchObject({ supplyRate: 'E', supplyAmount: 'F', erectionRate: 'G', erectionAmount: 'H' });
    expect(r.items[0]).toMatchObject({ supplyRate: 51_675, erectionRate: 1_214, issues: [] });
  });

  it('flags every interpretation and blocks on what it could not read', () => {
    const r = parseBoq(
      grid([
        header,
        ['1', 'LT cable', null, '100 Mtr', 866, 86_600, 15, 1_500],
        ['2', 'Earthing', 'RMtr', 'LS', null, null, 335, null],
        ['3', 'Lamp', 'Nos', 4, 19_094, 70_000, null, null],
        ['4', 'Plates', 'Nos', -2, 416, null, null, null],
        ['4', 'Plates again', 'Nos', 2, 'quote', null, null, null],
        ['5', '', 'Nos', 1, 100, null, null, null],
      ]),
      'b.xlsx',
      'electrical',
    );
    const [cable, earthing, lamp, plates, again, blank] = r.items;
    expect(cable).toMatchObject({ qty: 100, unit: 'Mtr' });
    expect(warningsOf(cable!).map((w) => w.message)).toEqual(['Quantity read from “100 Mtr” as 100']);
    expect(openErrors(earthing!).map((e) => e.message)).toEqual(['Quantity “LS” is not a number']);
    expect(warningsOf(lamp!)[0]!.message).toBe('Supply amount in the file is 70,000, but qty × rate is 76,376');
    expect(openErrors(plates!)[0]!.message).toBe('Quantity -2 is negative');
    expect(again!.supplyRate).toBe(0);
    expect(warningsOf(again!).map((w) => w.message)).toEqual(['Supply rate “quote” is not a number; left blank', 'Item number 4 also appears on row 5']);
    expect(openErrors(blank!).map((e) => e.field)).toEqual(['description']);
    expect(openErrors({ ...earthing!, qty: 1 })).toEqual([]);
  });

  it('reports a total that does not match the items above it', () => {
    const r = parseBoq(grid([header, ['1', 'A', 'Nos', 2, 10, 20], ['2', 'B', 'Nos', 1, 5, 5], [null, 'Total', null, null, null, 30]]), 'b.xlsx', 'electrical');
    expect(r.totals[0]).toMatchObject({ stated: 30, computed: 25 });
  });

  it('starts summary sheets excluded, skips hidden sheets and explains a sheet without a table', () => {
    const r = parseBoq(
      [
        { name: 'Abstract', rows: [header, ['1', 'A', 'Nos', 1, 1]] },
        { name: 'Old', hidden: true, rows: [header, ['1', 'A', 'Nos', 1, 1]] },
        { name: 'Notes', rows: [['Prepared by'], ['AEE']] },
      ],
      'b.xlsx',
      'electrical',
    );
    expect(r.sheets.map((s) => [s.name, s.includedByDefault])).toEqual([
      ['Abstract', false],
      ['Old', false],
      ['Notes', true],
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.sheets[2]!.note).toMatch(/No BOQ table found/);
  });

  it('fails clearly when nothing looks like a BOQ', () => {
    expect(parseBoq(grid([['hello']]), 'x.xlsx', 'civil').failure).toMatch(/No BOQ items found/);
  });
});

describe('readBoqWorkbook', () => {
  it('reads a real .xlsx: formulas by saved result, merged headers, hidden rows', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Civil BOQ');
    ws.addRow(['Sl No', 'Description of item', 'Unit', 'Quantity', 'Rate', 'Amount']);
    ws.addRow(['B1', 'Earth work excavation', 'Cum', 2.662, 102, { formula: 'D2*E2', result: 271.52 }]);
    ws.addRow(['B2', 'PCC 1:4:8', 'Cum', { formula: '0.25*2', result: 0.5 }, 6147, { formula: 'D3*E3', result: 3073.5 }]);
    ws.addRow(['B3', 'Steel', 'Kg', 80, 69.749, 5579.92]);
    ws.getRow(4).hidden = true;
    ws.addRow(['B4', 'Plaster', 'Sqm', { formula: 'X1' }, 266, null]);
    ws.mergeCells('B6:C6');
    ws.getCell('B6').value = 'Merged description';
    ws.getCell('D6').value = 1;
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const r = await readBoqWorkbook(buffer, 'civil.xlsx', 'civil');
    expect(r.failure).toBeUndefined();
    expect(r.items.map((i) => [i.code, i.qty, i.supplyRate])).toEqual([
      ['B1', 2.662, 102],
      ['B2', 0.5, 6147],
      ['B3', 80, 69.749],
      ['B4', null, 266],
      ['', 1, 0],
    ]);
    expect(warningsOf(r.items[2]!).map((w) => w.message)).toEqual(['This row is hidden in Excel']);
    expect(openErrors(r.items[3]!)[0]!.message).toMatch(/no saved result/);
    expect(r.items[4]).toMatchObject({ description: 'Merged description', unit: '' });
  });

  it('returns a failure instead of throwing for a file that is not a workbook', async () => {
    const r = await readBoqWorkbook(new TextEncoder().encode('not a zip').buffer as ArrayBuffer, 'x.xlsx', 'civil');
    expect(r.failure).toMatch(/could not be opened/);
  });
});
