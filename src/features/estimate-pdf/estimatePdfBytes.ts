import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { readJson } from '@/lib/storage';
import { withDefaults, type PdfSettings } from './format';
import { layout } from './layout';
import { loadFonts, renderPdf } from './renderPdf';
import { sheetsFromWorkbook, type PdfSheet } from './sheets';
import { columnWidths, placeEstimateSheets, type EstimateWorkbook } from './workbookSheets';
import { BOQ_DOCUMENTS } from '@/features/boq-import/api';
import { parseBoq } from '@/features/boq-import/parse';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import type { DprDocuments } from '@/features/documents/types';
import { getFile } from '@/lib/fileStore';
import { sampleStore } from '@/lib/sampleStore';

/** Where the PDF editor keeps a DPR's layout settings. */
export const settingsKey = (dprId: string) => `dpr-estimate-pdf:${dprId}`;

/**
 * The abstract and estimate PDF exactly as the editor would download it, with the DPR's saved layout.
 * `fallback` fills settings the DPR hasn't saved (the final DPR asks for A4, like the Thyavanige DPR).
 */
export async function estimatePdfBytes(dpr: DprRow, estimate: Estimate, fallback: Partial<PdfSettings> = {}): Promise<Uint8Array | null> {
  const saved = readJson<Partial<PdfSettings> | null>(settingsKey(dpr.id), null);
  const sheets = await estimateSheets(dpr, estimate);
  const settings = orderFor(withDefaults({ ...fallback, ...(saved ?? {}) }), sheets);
  const pages = layout(sheets, settings, await loadFonts());
  return pages.length ? renderPdf(pages, `Abstract & Estimate · ${dpr.project}`) : null;
}

/**
 * Every sheet the Abstract & Estimate PDF prints, in the set order: the app's estimate sheets (parts with nothing in
 * them left out) and the uploaded estimate workbook's other sheets in their places (see SLOTS in workbookSheets).
 */
export async function estimateSheets(dpr: DprRow, estimate: Estimate, documents?: DprDocuments): Promise<PdfSheet[]> {
  const app = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, estimate));
  const { workbooks } = await estimateWorkbooks(dpr.id, documents).catch(() => ({ workbooks: [] as EstimateWorkbook[] }));
  return placeEstimateSheets(app, workbooks).map((p) => p.sheet);
}

/**
 * A sheet order saved in the editor before sheets were added (a workbook uploaded since) would push the new sheets to
 * the end; such an order is dropped so the set order applies.
 */
export function orderFor(settings: PdfSettings, sheets: { key: string }[]): PdfSettings {
  const order = settings.sheetOrder;
  if (!order?.length || sheets.every((x) => order.includes(x.key))) return settings;
  return { ...settings, sheetOrder: undefined, pageOrder: undefined };
}

/**
 * The estimate workbooks uploaded for a DPR whose bytes this browser kept, read again. `missing` names the ones read
 * before the file itself was kept (or attached in another browser): upload them again to print their other sheets.
 */
export async function estimateWorkbooks(dprId: string, documents?: DprDocuments): Promise<{ workbooks: EstimateWorkbook[]; missing: string[] }> {
  const reads = sampleStore.boqReads(dprId);
  const workbooks: EstimateWorkbook[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const [docKey, section] of Object.entries(BOQ_DOCUMENTS)) {
    const names = [...(reads[docKey] ?? []).filter((r) => !r.failure).map((r) => r.fileName), ...(documents?.files[docKey] ?? []).map((f) => f.name)];
    for (const name of names) {
      if (seen.has(name) || !/\.xls[xm]?$/i.test(name)) continue;
      seen.add(name);
      const stored = await getFile(dprId, docKey, name).catch(() => undefined);
      if (!stored) {
        missing.push(name);
        continue;
      }
      try {
        const grids = await workbookToGrids(stored.data);
        workbooks.push({ fileName: name, grids, read: parseBoq(grids, name, section), widths: await columnWidths(stored.data) });
      } catch {
        missing.push(name);
      }
    }
  }
  return { workbooks, missing };
}

export interface FinalEstimatePdf {
  bytes: Uint8Array | null;
  /** Sheets printed from the estimate and from the workbooks. */
  fromEstimate: number;
  fromWorkbooks: string[];
}

/**
 * The estimate part of the final DPR in the user's order (see SLOTS): the app's estimate sheets, with the other sheets
 * of the uploaded workbooks in their places. With `withEstimate` false (the user supplied the estimate PDF) only the
 * workbook sheets that estimate doesn't print are made, to follow that PDF.
 */
export async function finalEstimatePdfBytes(dpr: DprRow, estimate: Estimate, workbooks: EstimateWorkbook[], opts: { withEstimate: boolean; fallback?: Partial<PdfSettings> }): Promise<FinalEstimatePdf> {
  const saved = readJson<Partial<PdfSettings> | null>(settingsKey(dpr.id), null);
  // The final DPR follows the fixed order, so the editor's own sheet and page order don't apply here.
  const settings = { ...withDefaults({ ...(opts.fallback ?? {}), ...(saved ?? {}) }), sheetOrder: [], pageOrder: [] };
  const app = sheetsFromWorkbook(await buildEstimateWorkbook(dpr, estimate)).filter((s) => settings.sheets[s.key]?.include !== false);
  const placed = placeEstimateSheets(opts.withEstimate ? app : [], workbooks, { appKeys: app.map((s) => s.key) });
  const pages = layout(placed.map((p) => p.sheet), settings, await loadFonts());
  return {
    bytes: pages.length ? await renderPdf(pages, `Abstract & Estimate · ${dpr.project}`) : null,
    fromEstimate: placed.filter((p) => p.from === 'estimate').length,
    fromWorkbooks: placed.filter((p) => p.from !== 'estimate').map((p) => p.name),
  };
}
