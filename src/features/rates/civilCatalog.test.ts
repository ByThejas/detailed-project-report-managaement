import ExcelJS from 'exceljs';
import catalog from '@/data/rateCatalog.json';
import { allItems, buildIndex, certainMatch, exactCodeMatch, itemOfRateRef, rateRefOf, suggestRates } from './match';
import { readCatalogFile } from './catalogFile';
import type { RateCatalog } from './types';

const sor = catalog as RateCatalog;

/** A civil schedule of rates in its own layout, as a KPWD-style SR workbook might be. */
async function civilWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('KPWD SR 2024-25');
  ws.addRow(['Public Works Department: Schedule of Rates']);
  ws.addRow([]);
  ws.addRow(['Item No', 'Description of item', 'Unit', 'Rate (Rs)', 'Remarks']);
  ws.addRow(['4', 'CONCRETE WORK']);
  ws.addRow([null, 'Providing and laying cement concrete in foundation, including curing:']);
  ws.addRow(['4.1.1', 'M15 grade (1:2:4) using 20 mm graded aggregate', 'Cum', 6850, 'p112']);
  ws.addRow(['4.1.2', 'M20 grade using 20 mm graded aggregate', 'Cum', 7420, 'p112']);
  ws.addRow(['13', 'FENCING']);
  ws.addRow(['13.2', 'Chain link fencing with 50 x 50 mm mesh of 10 gauge GI wire on angle iron posts', 'Sqm', 1185, 'p301']);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('civil rate catalog', () => {
  it('reads a civil schedule of rates in its own layout, keeping headings as context', async () => {
    const civil = await readCatalogFile(await civilWorkbook(), 'KPWD SR 2024-25.xlsx', 'civil');
    expect(civil.items.map((i) => [i.code, i.unit, i.rate])).toEqual([
      ['4.1.1', 'Cum', 6850],
      ['4.1.2', 'Cum', 7420],
      ['13.2', 'Sqm', 1185],
    ]);
    expect(civil.items[0]).toMatchObject({ book: 'civil', kind: 'Item', sr: 'p112', context: 'CONCRETE WORK · Providing and laying cement concrete in foundation, including curing:' });
    expect(civil.items.every((i) => i.id.startsWith('civil:'))).toBe(true);
  });

  it('matches civil BOQ items against the civil catalog, and leaves electrical matching as it was', async () => {
    const civil = await readCatalogFile(await civilWorkbook(), 'KPWD SR 2024-25.xlsx', 'civil');
    const plain = buildIndex(sor);
    const both = buildIndex(sor, civil);
    expect(allItems(both)).toHaveLength(plain.items.length + 3);

    const fence = { description: 'Providing chain link fencing 50 x 50 mm mesh GI wire with angle iron posts', unit: 'Sqm', section: 'civil' as const };
    const top = suggestRates(both, fence, 3)[0]!;
    expect(top.item.code).toBe('13.2');
    expect(top.supplyRate).toBe(1185);
    expect(rateRefOf(top)).toBe('Civil SR · KPWD SR 2024-25 13.2 · p301');
    expect(itemOfRateRef(both, rateRefOf(top))?.id).toBe(top.item.id);

    // An electrical line never gets a civil item, and its suggestions are the same with or without the civil catalog.
    const pt = { description: 'Power Transformer: a) 20 MVA, 66/11kV, Delta/Star, Dyn11, 3-Ph, 50Hz', unit: "No's", section: 'electrical' as const };
    expect(suggestRates(both, pt, 3)).toEqual(suggestRates(plain, pt, 3));
  });

  it('takes a civil item named by its SR code from the civil catalog', async () => {
    const civil = await readCatalogFile(await civilWorkbook(), 'KPWD SR 2024-25.xlsx', 'civil');
    const index = buildIndex(sor, civil);
    const line = { description: 'PCC M20 in foundation', unit: 'cum', section: 'civil' as const, srCode: '4.1.2' };
    expect(exactCodeMatch(index, line)).toMatchObject({ exact: true, supplyRate: 7420 });
    expect(certainMatch(index, line)?.item.code).toBe('4.1.2');
    // Electrical parts ignore it.
    expect(exactCodeMatch(index, { ...line, section: 'electrical' })?.item.book).toBeUndefined();
  });
});
