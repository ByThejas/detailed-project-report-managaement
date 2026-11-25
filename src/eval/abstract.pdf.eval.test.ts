import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import { parseBoq } from '@/features/boq-import/parse';
import { applyImport, planImport } from '@/features/boq-import/toEstimateLine';
import { buildTemplate } from '@/features/preparation/template';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import { sheetsFromWorkbook } from '@/features/estimate-pdf/sheets';
import { layout } from '@/features/estimate-pdf/layout';
import { loadFonts, renderPdf } from '@/features/estimate-pdf/renderPdf';
import { withDefaults } from '@/features/estimate-pdf/format';
import type { DprRow } from '@/features/reports/types';

const FILE = process.env.FILE ?? '';
const PDF = process.env.PDF ?? '/tmp/abstract.pdf';

/**
 * Imports one estimate workbook into a fresh substation DPR (the sample template under it) and prints the app's part
 * abstracts, to compare with the workbook's own abstract page.
 *   FILE="E:/BOQ/Jangamakote/.../66kV Jangamakote line strengthening Line Work Estimate.xlsx" PDF=out.pdf npx vitest run src/eval/abstract.pdf.eval.test.ts
 */
it.skipIf(!FILE || !existsSync(FILE))('abstract pages from an uploaded estimate', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string) => (String(u).includes('fonts/') ? new Response(new Uint8Array(readFileSync(join('public', String(u).slice(String(u).indexOf('fonts/')))))) : real(u))) as typeof fetch;
  const grids = await workbookToGrids(new Uint8Array(readFileSync(FILE)).buffer);
  const read = parseBoq(grids, FILE.split('/').pop()!, 'electrical');
  const dpr = { id: 'DPR-2026-001', project: 'Test DPR', capacity: '1x20 MVA', voltage: '66/11 kV', division: 'Test', stream: 'Brownfield', workType: 'Station work' } as unknown as DprRow;
  const used = new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));
  const plan = planImport(read, read.items.filter((i) => used.has(i.sheet)), used);
  const e = applyImport(buildTemplate(dpr), plan, 'replace');
  const sheets = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e, [read]));
  const abstracts = sheets.filter((s) => /^(General Abstract|Abstract-I|Abstract-II|Line Abstract)$/.test(s.key));
  for (const s of abstracts) console.log(s.key, s.title, s.notes[0], '\n' + s.rows.map((r) => r.cells.join(' | ')).join('\n'));
  console.log('template lines left:', e.lines.filter((l) => /sample template/.test(l.source ?? '')).length, 'statutory', e.statutoryCharges, 'loading', e.areaLoadingPct);
  const pages = layout(abstracts, withDefaults({}), await loadFonts());
  writeFileSync(PDF, await renderPdf(pages, 'abstract'));
}, 120000);
