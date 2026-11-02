import { existsSync, readFileSync } from 'node:fs';
import * as docx from 'docx';
import JSZip from 'jszip';
import { buildTemplate } from '@/features/preparation/template';
import { DEFAULT_BCR_INPUTS } from '@/features/preparation/finance';
import type { Estimate } from '@/features/preparation/types';
import { readBoqWorkbook } from '@/features/boq-import/readWorkbook';
import { applyImport, planImport } from '@/features/boq-import/toEstimateLine';
import { row } from '@/test/fixtures';
import { EMPTY_DOCUMENTS } from '@/features/documents/types';
import { addFiles } from '@/features/documents/state';
import { createDprDocument } from './buildDocx';
import { contentGaps, contentOf, defaultContent, letteredSections } from './content';
import { dprChecklist, dprGaps } from './readiness';

const dpr = row({ project: 'Replacement of 2x8 MVA by 2x20 MVA transformers at 66/11 kV Kogali S/S', stream: 'Brownfield', voltage: '66 kV', capacity: '2x20 MVA' });

async function xmlOfEstimate(e: Estimate, gaps: string[], d = dpr) {
  const documents = addFiles(EMPTY_DOCUMENTS, 'grid-map', [{ name: 'Grid-map-KLB.pdf', size: 1, addedAt: '' }]);
  const doc = createDprDocument(docx, { dpr: d, estimate: e, documents, content: contentOf(d, e), gaps, now: new Date('2026-10-31') });
  const zip = await JSZip.loadAsync(await docx.Packer.toBuffer(doc));
  return zip.file('word/document.xml')!.async('string');
}

function kogali() {
  const e = buildTemplate(dpr);
  e.misc = { supply: 93_379.27, erection: 5_412.75, testing: 10_079.33, civil: 1_746.25, dismantling: 4_316.18 };
  e.financials = { method: 'manual', discountRatePct: 10, benefits: [300, 300, 300, 300] };
  return e;
}

describe('DPR Word document', () => {
  it('follows the finished DPR: cover, contents, 01, 02 a–n, estimates, PERT, BCR and annexures 3–9', async () => {
    const xml = await xmlOfEstimate(kogali(), []);
    for (const s of [
      'D E T A I L E D',
      'CONTENTS',
      'PROJECT AT A GLANCE',
      'PROJECT REPORT',
      'a. SCOPE OF THE PROJECT',
      'd. OBJECTIVES',
      'i) PRIMARY',
      'COST–BENEFIT ANALYSIS AND PAYBACK PERIOD',
      'SALIENT FEATURES',
      'ESTIMATES &amp; ABSTRACT',
      'GENERAL ABSTRACT',
      'PART-A: CAPITAL WORK',
      'PART-B: REVENUE WORKS',
      'CERTIFICATE:',
      'PERT CHART',
      'Stage-III',
      'FINANCIAL BCR',
      'EXTRACT OF TCCM PROCEEDINGS',
      'R&amp;D EARTHMAT DESIGN REPORT',
    ]) {
      expect(xml, s).toContain(s);
    }
    expect(xml).not.toContain('TOWER SCHEDULE');
    expect(xml).toContain('828.41');
    expect(xml).toContain('827.05');
    expect(xml).toContain('1.36');
    expect(xml).toContain('Enclosed: Grid-map-KLB.pdf.');
    expect(xml).not.toContain('DRAFT');
  });

  it('marks the cover DRAFT and lists what is missing', async () => {
    const xml = await xmlOfEstimate(kogali(), ['rates for A1 a', 'text: b. Existing power supply arrangements']);
    expect(xml).toContain('DRAFT: NOT READY FOR SUBMISSION');
    expect(xml).toContain('rates for A1 a; text: b. Existing power supply arrangements');
  });

  it('counts unwritten [placeholders], empty facts, missing documents and BCR inputs as gaps, by step', () => {
    const content = defaultContent(dpr);
    expect(contentGaps(content)).toContain('b. Existing power supply arrangements');
    expect(contentGaps(content)).toContain('Existing capacity');
    expect(contentGaps(content)).not.toContain('Line component');
    expect(contentGaps(content)).not.toContain('e. Schedule of implementation');
    const checklist = dprChecklist(buildTemplate(dpr), EMPTY_DOCUMENTS, content);
    expect(checklist).toContainEqual({ step: 'inputs', label: 'document: TCCM Proceedings' });
    expect(checklist.map((g) => g.label)).not.toContain('document: TCCM Proposal');
    expect(checklist).toContainEqual({ step: 'finance', label: 'BCR inputs (additional MVA)' });
    expect(dprGaps(buildTemplate(dpr), EMPTY_DOCUMENTS, content)).toContain('text: Existing capacity');
  });

  it('adds the tower schedule and line rows only when there are line works', () => {
    expect(letteredSections(false).map((s) => s.letter + s.group)).toEqual([
      'aScope of the project',
      'bExisting power supply arrangements',
      'cProblems',
      'dObjectives',
      'eSchedule of implementation',
      'fResults to be achieved after commissioning',
      'gList of alternatives',
      'hProposals',
      'iCost–benefit analysis and payback period',
      'jExpenditure',
      'kApprovals',
      'lBudget provision',
    ]);
    // With line works the letters run a–m plus n. Salient features, as in the Thyavanige DPR.
    expect(letteredSections(true).map((s) => s.letter + s.group)).toContain('iTower schedule');
    expect(letteredSections(true)).toHaveLength(13);
    const gaps = contentGaps(defaultContent(dpr, true), true);
    expect(gaps).toContain('Line component');
    expect(gaps).toContain('Tower schedule table');
  });

  it('keeps text saved before the objectives were split', () => {
    const e = buildTemplate(dpr);
    e.document = { details: {}, sections: { objectives: 'To reduce the load.' } } as unknown as Estimate['document'];
    expect(contentOf(dpr, e).sections.objectivesPrimary).toBe('To reduce the load.');
  });

  // The real workbook is not committed (the repo is public). Put it at fixtures/private/thyavanige.xlsx to run this.
  const real = 'fixtures/private/thyavanige.xlsx';
  it.skipIf(!existsSync(real))('generates a full Thyavanige DPR from the real estimate workbook', async () => {
    const r = await readBoqWorkbook(new Uint8Array(readFileSync(real)).buffer, 'thyavanige.xlsx', 'electrical');
    const sheets = new Set(r.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));
    const thy = row({ project: 'Additional 1x20 MVA transformer and LILO at 66/11 kV Thyavanige', stream: 'Brownfield', voltage: '66/11 kV', capacity: '1x20 MVA' });
    const e = applyImport(buildTemplate(thy), planImport(r, r.items, sheets), 'replace');
    // The workbook has no dismantling sheet, so the sample's dismantling lines are still there and flagged.
    expect(dprGaps(e, EMPTY_DOCUMENTS, contentOf(thy, e)).some((g) => g.includes("still the sample template's (Dismantling"))).toBe(true);
    e.lines = e.lines.filter((l) => l.section !== 'dismantling');
    e.financials = { method: 'kptcl', inputs: { ...DEFAULT_BCR_INPUTS, addedMva: 20 }, discountRatePct: 9, benefits: [] };
    const xml = await xmlOfEstimate(e, [], thy);
    for (const s of ['TOWER SCHEDULE', 'LINE WORKS: CIVIL PORTION', 'ABSTRACT: LINE WORKS', 'INPUT PARAMETERS', 'APPRAISAL SUMMARY', 'YEAR-WISE SCHEDULE', '61.057', '1,273.17']) {
      expect(xml, s).toContain(s);
    }
    expect(xml).toContain('n. SALIENT FEATURES');
  });
});
