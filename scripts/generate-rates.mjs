// Builds src/data/rateCatalog.json from the KPTCL rate catalog workbook (Common SoR 2023-24).
// Usage: npm run generate:rates [-- path/to/rate_catalog.xlsx ["rate_catalog 76.xlsx"]]
//
// Each sheet has columns Code | Kind | Item / Activity | Unit | Rate | SR ref | Remarks. A coded Supply row is
// followed by its uncoded Labour and T&C rows. Rows without a kind are chapter headings or a shared
// description for the items below them; both are kept as context so a BOQ line can be matched to the item.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ExcelJS from 'exceljs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ?? path.join(root, 'data', 'rate_catalog.xlsx');
const clean = (v) => {
  if (v && typeof v === 'object' && 'result' in v) v = v.result;
  if (v && typeof v === 'object' && 'richText' in v) v = v.richText.map((t) => t.text).join('');
  return String(v ?? '').replace(/\s+/g, ' ').trim();
};
const num = (v) => {
  if (v && typeof v === 'object' && 'result' in v) v = v.result;
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const items = [];
const stats = {};
for (const ws of wb.worksheets) {
  let chapter = '';
  let context = '';
  let current = null;
  let count = 0;
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const code = clean(row.getCell(1).value);
    const kind = clean(row.getCell(2).value);
    const text = clean(row.getCell(3).value);
    const unit = clean(row.getCell(4).value);
    const rate = num(row.getCell(5).value);
    const sr = clean(row.getCell(6).value);
    if (!kind) {
      if (code && code !== '—' && /\(\d+ items?\)\s*$/.test(text)) {
        chapter = text.replace(/\s*\(\d+ items?\)\s*$/, '');
        context = '';
      } else if (code === '—') {
        chapter = '';
        context = '';
      } else context = text;
      current = null;
      return;
    }
    if (kind === 'Supply' || (code && code !== '—')) {
      current = { id: `${ws.name}#${n}`, sheet: ws.name, code, kind, item: text, context: [chapter, context].filter(Boolean).join(' · '), unit, rate, sr, labour: [], tc: [] };
      items.push(current);
      count += 1;
      return;
    }
    if (!current || rate === null) return;
    (kind === 'T&C' ? current.tc : current.labour).push({ text, unit, rate, sr });
  });
  stats[ws.name] = count;
}

const out = path.join(root, 'src', 'data', 'rateCatalog.json');
// The canonical catalog is "rate_catalog 76.xlsx" (see data/RATE_CATALOG.md); its name carries the version.
const name = process.argv[3] ?? 'rate_catalog 76.xlsx';
const version = Number(/(\d+)\.xlsx$/i.exec(name)?.[1] ?? 0) || null;
writeFileSync(out, JSON.stringify({ source: name, version, items }));
console.log(`Wrote ${items.length} items to ${path.relative(root, out)}`, stats);
