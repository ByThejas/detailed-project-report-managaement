import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { row } from '@/test/fixtures';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import { parseBoq } from '@/features/boq-import/parse';
import { applyImport, dropPresets, planImport } from '@/features/boq-import/toEstimateLine';
import { buildTemplate } from '@/features/preparation/template';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import { sheetsFromWorkbook } from '@/features/estimate-pdf/sheets';
import { withDefaults } from '@/features/estimate-pdf/format';
import { layout } from '@/features/estimate-pdf/layout';
import { renderPdf, setFontBytes, loadFonts } from '@/features/estimate-pdf/renderPdf';

const F = process.env.WB ?? '';
const font = (f: string) => new Uint8Array(readFileSync(`public/fonts/${f}`));
/** Renders the app's estimate PDF for one workbook (WB=file OUT=pdf), to look at. */
it.skipIf(!F || !existsSync(F))('look', async () => {
  setFontBytes({ regular: font('URWBookman-Light.ttf'), bold: font('URWBookman-Demi.ttf') });
  const dpr = row({ voltage: '66 kV', capacity: '1x20 MVA', stream: 'Brownfield' });
  const read = parseBoq(await workbookToGrids(new Uint8Array(readFileSync(F)).buffer), F, 'electrical');
  const used = new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));
  const plan = planImport(read, read.items.filter((i) => used.has(i.sheet) && !i.issues.some((x) => x.level === 'error')), used);
  const e = dropPresets(applyImport(buildTemplate(dpr), plan, 'replace'), [read]);
  const sheets = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, e, [read]));
  const pages = layout(sheets, withDefaults({ paper: 'a4' }), await loadFonts());
  writeFileSync(process.env.OUT ?? '/tmp/look.pdf', await renderPdf(pages, 'look'));
}, 120000);
