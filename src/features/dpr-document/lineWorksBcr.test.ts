import * as docx from 'docx';
import JSZip from 'jszip';
import { row } from '@/test/fixtures';
import { EMPTY_DOCUMENTS } from '@/features/documents/types';
import { buildEstimateWorkbook } from '@/features/preparation/exportEstimate';
import { buildTemplate } from '@/features/preparation/template';
import { isBcrExempt, isPureLineWorks } from '@/features/preparation/finance';
import type { Estimate, EstimateLine } from '@/features/preparation/types';
import { createDprDocument } from './buildDocx';
import { contentOf, letteredSections, lineScale } from './content';
import { crossChecks } from './crossChecks';
import { dprChecklist } from './readiness';

// ADR-0007: a line and its terminal bays, with no change in substation capacity, carry no BCR.
const dpr = row({ project: 'Construction of 66 kV LILO line to Somenahalli S/S', stream: 'Brownfield', voltage: '66 kV', capacity: '' });

const line = (section: EstimateLine['section'], description: string, unit = 'Nos', qty = 1): EstimateLine => ({
  id: `${section}-${description}`,
  section,
  code: '',
  description,
  unit,
  qty,
  supplyRate: 1000,
  erectionRate: 100,
  testingRate: 10,
});

function lineOnly(): Estimate {
  const e = buildTemplate(dpr);
  e.lines = [
    line('electrical', '66 kV SF6 circuit breaker for line terminal bay'),
    line('electrical', '66 kV CT 400-200/1-1-1 A'),
    line('line', 'Coyote ACSR conductor', 'km', 3.3),
    line('line', 'Tower type DA, MS', 'MT', 4),
  ];
  e.financials = { method: 'kptcl', discountRatePct: 10, benefits: [] };
  return e;
}

async function xmlOf(e: Estimate) {
  const content = contentOf(dpr, e);
  content.details.lineEstimateTitle = 'Construction of 66 kV LILO line for a distance of about 1.10 km with Coyote ACSR';
  content.details.terminalBays = '66 kV line terminal bays — 2 nos. (per TCCM)';
  content.tables.towers.rows = [
    ['1', 'DA', '3'],
    ['2', 'DB', '2'],
  ];
  const doc = createDprDocument(docx, { dpr, estimate: e, documents: EMPTY_DOCUMENTS, content, gaps: [], now: new Date('2026-11-04') });
  const zip = await JSZip.loadAsync(await docx.Packer.toBuffer(doc));
  return zip.file('word/document.xml')!.async('string');
}

describe('pure line works carry no BCR (ADR-0007)', () => {
  it('detects a line with terminal bays and no power transformer', () => {
    expect(isPureLineWorks(lineOnly())).toBe(true);
    const withPt = lineOnly();
    withPt.lines.push(line('electrical', '20 MVA, 66/11 kV power transformer'));
    expect(isPureLineWorks(withPt)).toBe(false);
    // A substation-only estimate is not line works at all.
    expect(isPureLineWorks(buildTemplate(row({ capacity: '2x20 MVA' })))).toBe(false);
  });

  it("lets the user's choice override the rule both ways", () => {
    const e = lineOnly();
    e.financials = { ...e.financials!, bcrExempt: false };
    expect(isBcrExempt(e)).toBe(false);
    const s = buildTemplate(row({ capacity: '2x20 MVA' }));
    s.financials = { method: 'kptcl', discountRatePct: 10, benefits: [], bcrExempt: true };
    expect(isBcrExempt(s)).toBe(true);
  });

  it('asks for no BCR inputs and runs no BCR checks', () => {
    const e = lineOnly();
    e.financials!.inputs = { ...e.financials!.inputs!, addedMva: 50 } as never;
    const content = contentOf(dpr, e);
    const gaps = dprChecklist(e, EMPTY_DOCUMENTS, content).map((g) => g.label);
    expect(gaps.some((g) => /BCR/.test(g))).toBe(false);
    expect(gaps.some((g) => /Cost–benefit/.test(g))).toBe(false);
    expect(crossChecks({ ...dpr, capacity: '20 MVA' }, e, content).filter((c) => c.id.startsWith('bcr-'))).toEqual([]);
    expect(letteredSections(true, true).some((s) => s.group.startsWith('Cost'))).toBe(false);
  });

  it('leaves the BCR out of the Word DPR and shows physical scale instead', async () => {
    const xml = await xmlOf(lineOnly());
    for (const s of ['COST–BENEFIT ANALYSIS', 'FINANCIAL BCR', 'B/C RATIO', 'Benefit–cost ratio', 'Not calculated']) expect(xml, s).not.toContain(s);
    for (const s of ['ROUTE LENGTH', '1.10 km', 'Towers', '5 nos.', 'Terminal bays', '2 nos.', 'EXTRACT OF TCCM PROCEEDINGS']) expect(xml, s).toContain(s);
  });

  it('keeps the BCR when the user overrides the rule', async () => {
    const e = lineOnly();
    e.financials = { ...e.financials!, bcrExempt: false };
    const xml = await xmlOf(e);
    expect(xml).toContain('FINANCIAL BCR');
    expect(xml).toContain('B/C RATIO');
  });

  it('leaves the BCR sheets out of the Excel estimate', async () => {
    const names = async (e: Estimate) => (await buildEstimateWorkbook(dpr, e)).worksheets.map((w) => w.name);
    expect((await names(lineOnly())).some((n) => /BCR|Cost/i.test(n))).toBe(false);
    const e = lineOnly();
    e.financials = { ...e.financials!, bcrExempt: false };
    expect(await names(e)).toContain('BCR Analysis');
  });

  it('reads route length, towers and bays from the text', () => {
    const c = contentOf(dpr, lineOnly());
    expect(lineScale(c)).toEqual({ route: '—', towers: '—', bays: '—' });
    c.details.nameOfWork = 'Construction of 110 kV DC line for 12.5 kms';
    c.details.terminalBays = '2 Nos. 110 kV terminal bays';
    expect(lineScale(c)).toMatchObject({ route: '12.5 km', bays: '2 nos.' });
  });
});
