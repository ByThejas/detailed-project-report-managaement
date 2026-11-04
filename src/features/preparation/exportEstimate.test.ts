import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CellValue, Workbook } from 'exceljs';
import { row } from '@/test/fixtures';
import { generalAbstract, sectionTotals } from './calc';
import { buildEstimateWorkbook } from './exportEstimate';
import { DEFAULT_BCR_INPUTS, kptclAppraisal, type Financials } from './finance';
import { buildTemplate } from './template';
import type { Estimate, EstimateLine, EstimateSection } from './types';

const dpr = row({ voltage: '66 kV', capacity: '2x20 MVA', stream: 'Brownfield' });

// Item 1 is the power transformer, so the work changes capacity and carries a BCR (ADR-0007).
const line = (section: EstimateSection, i: number, qty: number, s: number, er = 0, tc = 0): EstimateLine => ({
  id: `${section}-${i}`, section, code: `${section[0]}${i}`, description: section === 'electrical' && i === 1 ? '20 MVA power transformer' : `${section} item ${i}`, unit: 'No', qty, supplyRate: s, erectionRate: er, testingRate: tc,
});

function estimate(): Estimate {
  const t = buildTemplate(dpr);
  return {
    ...t,
    lines: [
      line('electrical', 1, 2, 31_247_000.55, 150_000.25, 30_000),
      line('electrical', 2, 3, 12_345.67, 1_111.11, 222.22),
      line('civil', 1, 120.5, 4_321.09),
      line('line', 1, 4.5, 139_000.5, 8_000.75, 0),
      line('lineCivil', 1, 7, 2_345.5),
      line('dismantling', 1, 3, 15_000.33),
    ],
    misc: { supply: 253_000.11, erection: 1_519.47, testing: 8_841, civil: 2_600, dismantling: 100, lineSupply: 11_000, lineErection: 2_000, lineTesting: 0, lineCivil: 50 },
    areaLoadingPct: 3,
    gstPct: 18,
    statutoryCharges: 100_000,
    forestCompensation: 25_000,
    lineCharges: { statutory: 10_000, forestCompensation: 5_000 },
    dismantlingStatutory: 0,
  } as Estimate;
}

describe('formula-driven estimate workbook', () => {
  it('writes amounts, totals, abstracts and the general abstract as formulas', async () => {
    const e = estimate();
    const wb = await buildEstimateWorkbook(dpr, e);
    const a = wb.getWorksheet('Part A Electrical')!;
    const items = [6, 7].map((n) => a.getRow(n)); // title, 2 notes and a blank row, then the header at 5
    expect(items[0]!.getCell(6).value).toMatchObject({ formula: 'ROUND($D6*E6,2)' });
    expect(items[0]!.getCell(8).value).toMatchObject({ formula: 'ROUND($D6*G6,2)' });
    expect(items[1]!.getCell(4).value).toBe(3);
    expect(a.getRow(8).getCell(6).value).toMatchObject({ formula: 'SUM(F5:F7)' });
    expect(a.getRow(10).getCell(6).value).toMatchObject({ formula: 'F8+F9' });
    const g = wb.getWorksheet('General Abstract')!;
    const formulas: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'object' && c.value && 'formula' in c.value) formulas.push(String((c.value as { formula: string }).formula)); })));
    expect(formulas.length).toBeGreaterThan(40);
    expect(g.getRow(6).getCell(3).value).toMatchObject({ formula: "'Abstract-I'!C16" });
    expect(g.getRow(9).getCell(3).value).toMatchObject({ formula: 'ROUND(SUM(C6:C8),2)' });
    expect((g.getRow(9).getCell(3).value as { result: number }).result).toBe(generalAbstract(e).total);
    expect(sectionTotals(e).total.supply).toBeGreaterThan(0);
    if (process.env.EXPORT_OUT) writeFileSync(process.env.EXPORT_OUT, Buffer.from(await wb.xlsx.writeBuffer()));
  });

  it('writes the BCR in the KPTCL BCR calculator layout, linked to the general abstract', async () => {
    const e = estimate();
    const inputs = { ...DEFAULT_BCR_INPUTS, addedMva: 20, salePrice: 8.96, transmissionCharge: 0.79, loadGrowthPct: 8, discountRatePct: 9 };
    e.financials = { method: 'kptcl', inputs, discountRatePct: 9, benefits: [] };
    const wb = await buildEstimateWorkbook(dpr, e);
    const a = wb.getWorksheet('BCR Analysis')!;
    const s = wb.getWorksheet('BCR Schedule')!;
    expect(a.getCell('C9').value).toMatchObject({ formula: "'General Abstract'!C9" });
    expect(a.getCell('G20').value).toMatchObject({ formula: 'G16/G17' });
    expect(s.getCell('K4').value).toMatchObject({ formula: 'K3+J4' });
    const app = kptclAppraisal(generalAbstract(e).total, inputs)!;
    expect((a.getCell('G20').value as { result: number }).result).toBeCloseTo(app.bcr, 10);
    expect(s.getRow(33).getCell(1).value).toBe(30);
    if (process.env.EXPORT_OUT) writeFileSync(process.env.EXPORT_OUT.replace('.xlsx', '-bcr.xlsx'), Buffer.from(await wb.xlsx.writeBuffer()));
  });

  // Opens the download in LibreOffice with every saved result removed, so each formula is worked out
  // afresh, and checks every one against the figure the app wrote. Skipped where LibreOffice isn't installed.
  const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/lib/libreoffice/program/soffice', 'C:/Program Files/LibreOffice/program/soffice.exe', '/Applications/LibreOffice.app/Contents/MacOS/soffice'].find(existsSync);
  const methods: [string, Financials][] = [
    ['KPTCL BCR', { method: 'kptcl', inputs: { ...DEFAULT_BCR_INPUTS, addedMva: 20 }, discountRatePct: 9, benefits: [] }],
    ['benefits by hand', { method: 'manual', discountRatePct: 10, benefits: [120, 130, 140, 150, 160] }],
  ];
  it.skipIf(!soffice).each(methods)('recalculates in a spreadsheet program to the same figures, cell for cell (%s)', { timeout: 180_000 }, async (_, financials) => {
    const e = estimate();
    e.financials = structuredClone(financials);
    const formulas = (wb: Workbook) => {
      const out = new Map<string, CellValue>();
      wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { if (c.value && typeof c.value === 'object' && 'formula' in c.value) out.set(`${ws.name}!${c.address}`, c.value); })));
      return out;
    };
    const wb = await buildEstimateWorkbook(dpr, e);
    const expected = formulas(wb);
    for (const key of expected.keys()) {
      const [sheet, addr] = key.split('!') as [string, string];
      const cell = wb.getWorksheet(sheet)!.getCell(addr);
      cell.value = { formula: (cell.value as { formula: string }).formula } as CellValue;
    }
    const dir = mkdtempSync(join(tmpdir(), 'recalc-'));
    try {
      writeFileSync(join(dir, 'in.xlsx'), Buffer.from(await wb.xlsx.writeBuffer()));
      execFileSync(soffice!, [`-env:UserInstallation=file://${join(dir, 'profile')}`, '--headless', '--convert-to', 'xlsx', '--outdir', join(dir, 'out'), join(dir, 'in.xlsx')], { timeout: 150_000, stdio: 'ignore' });
      const ExcelJS = (await import('exceljs')).default;
      const back = new ExcelJS.Workbook();
      await back.xlsx.load(new Uint8Array(readFileSync(join(dir, 'out', 'in.xlsx'))).buffer);
      const got = formulas(back);
      expect(expected.size).toBeGreaterThan(50);
      const wrong: string[] = [];
      for (const [key, v] of expected) {
        const want = (v as { result?: unknown }).result;
        const have = (got.get(key) as { result?: unknown } | undefined)?.result;
        const same = typeof want === 'number' && typeof have === 'number' ? Math.abs(want - have) <= 1e-6 * Math.max(1, Math.abs(want)) : want === have || (want === undefined && have === '');
        if (!same) wrong.push(`${key}: app ${String(want)}, recalculated ${String(have)}`);
      }
      expect(wrong).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
