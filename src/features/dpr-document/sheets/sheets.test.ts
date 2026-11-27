import { buildTemplate } from '@/features/preparation/template';
import { DEFAULT_BCR_INPUTS, kptclAppraisal } from '@/features/preparation/finance';
import { row } from '@/test/fixtures';
import { defaultContent } from '../content';
import { bcrHtml, coverHtml, pertHtml, sheetSet } from './index';
import { bcrSheetHtml } from './bcr';
import { dprHtml, narrativeData, textBlocks } from './index';
import { narrativeHtml } from './narrative';
import { THY_DPR, thyavanigeContent, thyavanigeEstimate } from './thyavanige.fixture';

const dpr = row({ project: 'Additional 1x20 MVA at 66/11 kV Thyavanige', stream: 'Brownfield', voltage: '66/11 kV', capacity: '1x20 MVA', station: 'Thyavanige' });

function thyavanige() {
  const e = buildTemplate(dpr);
  e.misc = { supply: 100_000, erection: 0, testing: 0, civil: 0, dismantling: 0 };
  e.financials = { method: 'kptcl', discountRatePct: 9, benefits: [], inputs: { ...DEFAULT_BCR_INPUTS, addedMva: 20, salePrice: 8.96, transmissionCharge: 0.79, loadGrowthPct: 8, discountRatePct: 9 } };
  const c = defaultContent(dpr);
  e.document = { ...c, details: { ...c.details, apwCode: 'BB1189', financialYear: 'FY 2026-27', jurisdiction: 'Tumakuru Operation Zone', projectNature: 'Brown Field — Additional Transformer + LILO', coverSubtitle: 'Channagiri Taluk, Davanagere District.', preparedBy: 'Prasanna Technologies Pvt. Ltd.', preparedByRole: 'DPR Consultant', reportMonth: 'October 2026' } };
  return e;
}

describe('printable cover, PERT and BCR sheets', () => {
  it('fills the cover from the DPR the way the cover generator does', () => {
    const s = sheetSet(dpr, thyavanige());
    expect(s.cover).toMatchObject({ kind: 'substation', code: 'BB1189, FY 2026-27', site: 'Brown Field', work: 'Additional Transformer + LILO', zone: 'Tumakuru Operation Zone', date: 'October 2026', status: '' });
    const html = coverHtml(s);
    expect(html).toContain('Detailed Project Report');
    expect(html).toContain('Brown Field &mdash;<br>Additional Transformer + LILO');
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
    expect(html).toContain('sheets/fonts/archivo-cover-800.woff2');
    expect(html).toContain('kptcl-logo-cover.png');
  });

  it('draws the PERT chart from the plan: pre-award rows, stages, milestones and stage detail', () => {
    const s = sheetSet(dpr, thyavanige());
    const html = pertHtml(s);
    expect(html).toContain('PERT CHART');
    expect(html).toContain('DPR &amp; funding');
    expect(html).toContain('STAGE-I');
    expect(html).toContain('M0');
    expect(html).toContain('LOI / Award — zero date');
    expect(html).toContain('@page { size: 297mm 210mm; margin: 0; }');
  });

  it('prints the BCR in the calculator layout with the app’s appraisal figures', () => {
    const inputs = { ...DEFAULT_BCR_INPUTS, addedMva: 20, salePrice: 8.96, transmissionCharge: 0.79, loadGrowthPct: 8, discountRatePct: 9 };
    const appraisal = kptclAppraisal(1231.59, inputs)!;
    const html = bcrSheetHtml({ title: 'Thyavanige', cost: 1231.59, inputs, appraisal });
    // The Thyavanige DPR's BCR annexure.
    for (const v of ['3.46', '3.81', '4,695.10 L', '-1,358.12 L', '1,231.59 L', '20,601 L', '22%', 'Break-even ≈ Yr 8.4', '3,463.51', '61.057']) expect(html, v).toContain(v);
    expect(html.match(/class="sheet-page/g)).toHaveLength(2);
  });

  it('has no BCR sheet for pure line works or manual benefits', () => {
    const e = thyavanige();
    e.financials = { method: 'manual', discountRatePct: 10, benefits: [100] };
    const s = sheetSet(dpr, e);
    expect(s.bcr).toBeNull();
    expect(s.bcrWhy).toMatch(/KPTCL method/);
    expect(bcrHtml(s)).toBeNull();
  });

  it('escapes text typed into the DPR', () => {
    const e = thyavanige();
    e.document!.details.coverTitle = '<script>alert(1)</script>';
    expect(coverHtml(sheetSet(dpr, e))).not.toContain('<script>alert(1)</script>');
  });

  it('lays out the contents, glance and report a to n as the Thyavanige DPR’s pages 2 to 10', () => {
    const d = narrativeData(THY_DPR, thyavanigeContent(), { cost: 1231.59, noBcr: false, lineWorks: true, figures: { bcr: '3.46', irr: '22%', payback: '9 Years' } });
    expect(d.contents.map((c) => c.label)).toEqual(['1.', '2.', 'a.', 'b.', 'c.', 'd.', 'i)', 'ii)', 'e.', 'f.', 'g.', 'h.', 'i.', 'j.', 'k.', 'l.', 'm.', 'n.', '3.', '4.', '5.', '6.', '7.', '8.', '9.']);
    expect(d.glance.map(([k]) => k)).toEqual(['Name of work', 'Location', 'Existing capacity', 'MVA added', 'Line component', 'Terminal bays', 'Existing source', 'Approval', 'Cost of DPR', 'Budget provision']);
    expect(d.glance[8]).toEqual(['Cost of DPR', '1,231.59 Lakh']);
    expect(d.kpi).toEqual([['Benefit–cost ratio', '3.46'], ['Internal rate of return', '22%'], ['Payback period', '9 years']]);
    expect(d.subline).toBe('Operations Division, Benkikere, Tumakuru Operations Zone');
    expect(d.report.map((s) => s.letter).join('')).toBe('abcdefghijklmn');
    // The stations table sits between points 4 and 5, where {table} is.
    const b = d.report[1]!.blocks;
    expect(b.map((x) => (x.t === 'n' ? x.n : x.t))).toEqual(['1.', '2.', '3.', '4.', 'grid', '5.']);
    // The tower table gets its total row.
    const towers = d.report[8]!.blocks.find((x) => x.t === 'grid');
    expect(towers && towers.t === 'grid' && towers.rows.at(-1)).toEqual(['', 'Total', '3']);
    const html = narrativeHtml(d);
    expect(html).toContain('Detailed Project Report');
    expect(html).toContain('<span class="lc">i)</span>');
    expect(html).toContain('SALIENT FEATURES');
  });

  it('reads report text as paragraphs and numbered points', () => {
    expect(textBlocks('Intro line.\n\n1. First\n2. Second\ncontinued')).toEqual([
      { t: 'p', text: 'Intro line.' },
      { t: 'n', n: '1.', text: 'First' },
      { t: 'n', n: '2.', text: 'Second\ncontinued' },
    ]);
  });

  it('prints the whole DPR in one document: A4 cover, A4 text pages with the page border as an image (prints without background graphics), A4 landscape PERT and BCR', () => {
    const html = dprHtml(sheetSet(THY_DPR, thyavanigeEstimate()));
    expect(html).toContain('@page dpr-text');
    expect(html).toContain('size: 595.28pt 841.89pt;');
    expect(html).toContain('@top-left-corner { content: url("data:image/svg+xml,');
    expect(html).toContain('<td>Nature of work</td>');
    expect(html).toContain('@page p-210mm-297mm { size: 210mm 297mm; margin: 0; }');
    expect(html).toContain('@page p-297mm-210mm { size: 297mm 210mm; margin: 0; }');
    expect(html).toContain('66/11 kV Thyavanige station — additional 1×20 MVA transformer and LILO arrangement');
    expect(html).toContain("local('Bookman Old Style')");
    // cover, PERT and two BCR pages around the flowing text.
    expect(html.match(/class="sheet-page/g)).toHaveLength(4);
    expect(html.indexOf('a4-wrapper')).toBeLessThan(html.indexOf('class="dpr-text"'));
    expect(html.indexOf('class="dpr-text"')).toBeLessThan(html.indexOf('class="sheet-page pert-page'));
  });
});
