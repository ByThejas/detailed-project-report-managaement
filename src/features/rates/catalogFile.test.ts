import { readFileSync } from 'node:fs';
import builtIn from '@/data/rateCatalog.json';
import { adoptIds, catalogToWorkbook, diffCatalogs, readCatalogFile } from './catalogFile';
import type { RateCatalog } from './types';

const catalog = builtIn as RateCatalog;
const bytes = (b: Buffer) => new Uint8Array(b).buffer;

describe('rate catalog workbook', () => {
  it('reads the canonical workbook exactly as the built-in catalog was generated', async () => {
    const read = await readCatalogFile(bytes(readFileSync('data/rate_catalog.xlsx')), 'rate_catalog 76.xlsx');
    expect(read.version).toBe(76);
    expect(read.items).toEqual(catalog.items);
  }, 60_000);

  it('downloads in a layout that reads back to the same catalog, so it can be edited in Excel', async () => {
    const book = await catalogToWorkbook(catalog);
    const back = adoptIds(catalog, await readCatalogFile(book, 'rate_catalog 77.xlsx'));
    expect(back.version).toBe(77);
    expect(back.items).toEqual(catalog.items);
    expect(diffCatalogs(catalog, back)).toEqual({ added: 0, removed: 0, changed: [] });
  }, 60_000);

  it('keeps item ids across a new catalog and lists changed rates', () => {
    const [a, b, c] = catalog.items;
    const prev: RateCatalog = { source: 'old.xlsx', items: [a!, b!, c!] };
    const next: RateCatalog = {
      source: 'new.xlsx',
      items: [
        { ...a!, id: 'By code#9', rate: 1 },
        { ...b!, id: 'By code#10', item: `${b!.item} (revised)` },
        { ...c!, id: 'By code#11', code: 'X.1' },
      ],
    };
    const adopted = adoptIds(prev, next);
    expect(adopted.items.map((i) => i.id)).toEqual([a!.id, b!.id, 'By code#11']);
    const d = diffCatalogs(prev, adopted);
    expect(d).toMatchObject({ added: 1, removed: 1 });
    expect(d.changed.map((x) => [x.item.code, x.was])).toEqual([[a!.code, a!.rate]]);
  });

  it('says plainly when a workbook has no rates', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['Name', 'Value']);
    await expect(readCatalogFile((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'notes.xlsx')).rejects.toThrow(/No rates found in notes.xlsx/);
  });
});
