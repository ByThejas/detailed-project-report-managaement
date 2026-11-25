import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import { parseBoq } from '@/features/boq-import/parse';
import { columnWidths, placeEstimateSheets, SLOTS } from '@/features/estimate-pdf/workbookSheets';
import { layout } from '@/features/estimate-pdf/layout';
import { loadFonts, renderPdf } from '@/features/estimate-pdf/renderPdf';
import { withDefaults } from '@/features/estimate-pdf/format';

const ROOT = process.env.BOQ_DIR ?? '';
const OUT = process.env.OUT ?? '/tmp/order-final.txt';
const PDF = process.env.PDF ?? '';
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SECTION_SHEET: Record<string, string> = { electrical: 'Part A Electrical', civil: 'Part B Civil', line: 'Line Supply', lineCivil: 'Line Civil', dismantling: 'Dismantling' };
const ABSTRACT_SHEET: Record<string, string> = { I: 'Abstract-I', line: 'Line Abstract', II: 'Abstract-II' };

/**
 * The final DPR's estimate pages for every estimate workbook (not the quantity-only "BOQ …" copies): the app's sheets
 * (as an import of that workbook makes them) and the workbook sheets added, in order. PDF=<dir> also writes each
 * workbook's own sheets as the PDF prints them.
 *   BOQ_DIR=E:/BOQ npx vitest run src/eval/order.pdf.eval.test.ts
 */
it.skipIf(!ROOT || !existsSync(ROOT))('final DPR estimate order', async () => {
  const out: string[] = [];
  if (PDF) {
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string) => (String(u).includes('fonts/') ? new Response(new Uint8Array(readFileSync(join('public', String(u).slice(String(u).indexOf('fonts/')))))) : real(u))) as typeof fetch;
  }
  for (const f of walk(ROOT).filter((x) => /\.xls[xm]?$/i.test(x) && !/\/BOQ[^/]*$/i.test(x))) {
    const name = f.split('/').pop()!;
    const grids = await workbookToGrids(new Uint8Array(readFileSync(f)).buffer);
    const read = parseBoq(grids, name, 'electrical');
    const used = new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));
    const keys = new Set<string>(['General Abstract']);
    for (const s of read.sheets) if (used.has(s.name) && read.items.some((i) => i.sheet === s.name)) keys.add(SECTION_SHEET[s.section ?? read.section]!);
    for (const a of read.abstracts ?? []) keys.add(ABSTRACT_SHEET[a.part]!);
    const app = [...keys].map((key) => ({ key, title: key, notes: [], columns: [], rows: [] }));
    const wb = { fileName: name, grids, read, widths: await columnWidths(new Uint8Array(readFileSync(f)).buffer) };
    const placed = placeEstimateSheets(app, [wb]);
    out.push(`\n## ${f.replace(ROOT, '')}`);
    for (const p of placed) out.push(`  ${SLOTS[p.slot]}`.padEnd(32) + (p.from === 'estimate' ? ` [estimate] ${p.name}` : ` [workbook] ${JSON.stringify(p.name)}`));
    if (PDF) {
      const all = placeEstimateSheets([], [wb]);
      const pages = layout(all.map((p) => p.sheet), { ...withDefaults({ paper: 'a4' }), sheetOrder: [], pageOrder: [] }, await loadFonts());
      const per = new Map<string, number>(); for (const pg of pages) per.set(pg.sheet, (per.get(pg.sheet) ?? 0) + 1);
      out.push('  pages: ' + [...per.entries()].map(([k, n]) => `${k.split(' › ').pop()}=${n}`).join(', '));
      if (pages.length) writeFileSync(join(PDF, name.replace(/\.[a-z]+$/i, '') + '.pdf'), await renderPdf(pages, name));
    }
  }
  writeFileSync(OUT, out.join('\n'));
}, 600000);
