import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import catalog from '@/data/rateCatalog.json';

describe('canonical rate catalog', () => {
  it('is rate_catalog 76.xlsx, and the bundled data comes from the workbook kept in data/', () => {
    expect(catalog.source).toBe('rate_catalog 76.xlsx');
    expect(catalog.version).toBe(76);
    expect(catalog.items).toHaveLength(3800);
    const doc = readFileSync('data/RATE_CATALOG.md', 'utf8');
    const sha = createHash('sha256').update(readFileSync('data/rate_catalog.xlsx')).digest('hex');
    expect(doc).toContain(sha);
  });
});
