import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import { parseBoq } from '@/features/boq-import/parse';
import { classifySheets, SLOTS, SKIP } from '@/features/estimate-pdf/workbookSheets';

const ROOT = process.env.BOQ_DIR ?? '';
const OUT = process.env.OUT ?? '/tmp/order.txt';
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

/**
 * Sorts the sheets of every workbook in a folder into the final DPR's order and writes the list for checking. Opt-in:
 *   BOQ_DIR=E:/BOQ OUT=order.txt npx vitest run src/eval/order.eval.test.ts
 */
it.skipIf(!ROOT || !existsSync(ROOT))('sheet order for every workbook', async () => {
  const out: string[] = [];
  for (const f of walk(ROOT).filter((x) => /\.xls[xm]?$/i.test(x))) {
    const name = f.split('/').pop()!;
    const grids = await workbookToGrids(new Uint8Array(readFileSync(f)).buffer);
    const read = parseBoq(grids, name, 'electrical');
    const places = classifySheets(grids, name, read);
    out.push(`\n## ${f.replace(ROOT, '')}`);
    const sorted = places.map((p, i) => ({ p, i })).sort((a, b) => (a.p.slot === SKIP ? 99 : a.p.slot) - (b.p.slot === SKIP ? 99 : b.p.slot) || a.i - b.i);
    for (const { p } of sorted) out.push(`  ${p.slot === SKIP ? 'skip' : SLOTS[p.slot]}`.padEnd(32) + ` ${JSON.stringify(p.name)}  (${p.why})`);
  }
  writeFileSync(OUT, out.join('\n'));
}, 600000);
