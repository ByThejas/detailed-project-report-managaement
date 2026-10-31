import * as docx from 'docx';
import JSZip from 'jszip';
import { buildTemplate } from '@/features/preparation/template';
import { row } from '@/test/fixtures';
import { EMPTY_DOCUMENTS } from '@/features/documents/types';
import { addFiles } from '@/features/documents/state';
import { createDprDocument } from './buildDocx';
import { contentGaps, defaultContent } from './content';
import { dprGaps } from './readiness';

const dpr = row({ project: 'Replacement of 2x8 MVA by 2x20 MVA transformers at 66/11 kV Kogali S/S', stream: 'Brownfield', voltage: '66 kV', capacity: '2x20 MVA' });

async function xmlOf(gaps: string[]) {
  const e = buildTemplate(dpr);
  e.misc = { supply: 93_379.27, erection: 5_412.75, testing: 10_079.33, civil: 1_746.25, dismantling: 4_316.18 };
  e.financials = { discountRatePct: 10, benefits: [300, 300, 300, 300] };
  const documents = addFiles(EMPTY_DOCUMENTS, 'grid-map', [{ name: 'Grid-map-KLB.pdf', size: 1, addedAt: '' }]);
  const doc = createDprDocument(docx, { dpr, estimate: e, documents, content: defaultContent(dpr), gaps, now: new Date('2026-10-31') });
  const zip = await JSZip.loadAsync(await docx.Packer.toBuffer(doc));
  return zip.file('word/document.xml')!.async('string');
}

describe('DPR Word document', () => {
  it('contains the sections, the sample totals and the annexures', async () => {
    const xml = await xmlOf([]);
    for (const s of ['DETAILED PROJECT REPORT', '01 PROJECT AT A GLANCE', '09 COST-BENEFIT ANALYSIS AND PAYBACK PERIOD', '14 SALIENT FEATURES', 'ANNEXURE A: ESTIMATES AND ABSTRACT', 'Abstract-II: dismantling', 'ANNEXURE D: FINANCIAL BCR']) {
      expect(xml).toContain(s);
    }
    expect(xml).toContain('Rs 828.41 lakh');
    expect(xml).toContain('827.05');
    expect(xml).toContain('1.36');
    expect(xml).toContain('Attached separately: Grid-map-KLB.pdf');
    expect(xml).not.toContain('DRAFT');
  });

  it('marks the cover DRAFT and lists what is missing', async () => {
    const xml = await xmlOf(['rates for A1 a', 'text: 03 Existing power supply arrangements']);
    expect(xml).toContain('DRAFT: NOT READY FOR SUBMISSION');
    expect(xml).toContain('rates for A1 a; text: 03 Existing power supply arrangements');
  });

  it('counts unwritten [placeholders], empty facts, missing documents and benefits as gaps', () => {
    const content = defaultContent(dpr);
    expect(contentGaps(content)).toContain('03 Existing power supply arrangements');
    expect(contentGaps(content)).toContain('Existing capacity');
    expect(contentGaps(content)).not.toContain('06 Schedule of implementation');
    const gaps = dprGaps(buildTemplate(dpr), EMPTY_DOCUMENTS, content);
    expect(gaps).toContain('document: TCCM Proposal');
    expect(gaps).toContain('yearly benefits for the BCR');
  });
});
