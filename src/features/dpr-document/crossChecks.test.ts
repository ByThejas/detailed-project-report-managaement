import { buildTemplate } from '@/features/preparation/template';
import { DEFAULT_BCR_INPUTS } from '@/features/preparation/finance';
import { existingCapacityText, lf2, loadFigures } from '@/features/preparation/load';
import { EMPTY_DOCUMENTS } from '@/features/documents/types';
import { row } from '@/test/fixtures';
import { contentOf } from './content';
import { abstractOf } from '@/features/preparation/calc';
import { crossChecks, estimateChecks, highestKv, mvaRatings, openBlockers } from './crossChecks';
import { dprChecklist } from './readiness';

const dpr = row({ project: 'Additional 1x20 MVA transformer at 66/11 kV Thyavanige', stream: 'Brownfield', voltage: '66/11 kV', capacity: '1x20 MVA' });

describe('cross-checks', () => {
  it('reads MVA ratings and voltages out of text', () => {
    expect(mvaRatings('Power transformer 16/20 MVA, 66/11 kV')).toEqual([16, 20]);
    expect(mvaRatings('1x20 MVA, 66 kV')).toEqual([20]);
    expect(highestKv('110/66/11 kV')).toBe(110);
  });

  it('agrees with itself when the estimate is built from the DPR', () => {
    const e = buildTemplate(dpr);
    expect(crossChecks(dpr, e, contentOf(dpr, e)).filter((c) => c.severity === 'blocker')).toEqual([]);
  });

  it('blocks a transformer of the wrong rating or voltage until it is fixed or accepted', () => {
    const e = buildTemplate(dpr);
    const pt = e.lines.find((l) => l.code === 'A1 a')!;
    pt.description = 'Power transformer 8 MVA, 110/11 kV, Dyn11, OLTC';
    const content = contentOf(dpr, e);
    const checks = crossChecks(dpr, e, content);
    expect(checks.map((c) => c.message)).toEqual(
      expect.arrayContaining(['Item A1 a prices a 8 MVA transformer, but the DPR is for 1x20 MVA.', 'Item A1 a is a 110 kV transformer, but the DPR is for 66/11 kV.']),
    );
    expect(dprChecklist(e, EMPTY_DOCUMENTS, content, checks).filter((g) => g.label.startsWith('mismatch:'))).toHaveLength(2);
    const acks = Object.fromEntries(checks.map((c) => [c.id, { message: c.message, note: 'checked' }]));
    expect(openBlockers(checks, acks)).toEqual([]);
    // An acknowledgement is for one message only.
    expect(openBlockers(checks, { [checks[0]!.id]: { message: 'old', note: 'x' } })).toHaveLength(2);
  });

  it('flags section 01 text, BCR MVA and workbook abstract totals that disagree', () => {
    const e = buildTemplate(dpr);
    e.financials = { method: 'kptcl', inputs: { ...DEFAULT_BCR_INPUTS, addedMva: 25 }, discountRatePct: 9, benefits: [] };
    const content = contentOf(dpr, e);
    content.details.mvaAdded = '12.5 MVA';
    const msgs = crossChecks(dpr, e, content, [{ sheet: 'Abstract I ', part: 'I', title: '', total: 1 }]).map((c) => c.message);
    expect(msgs).toContain('“MVA added” mentions 12.5 MVA, but the DPR is for 1x20 MVA.');
    expect(msgs).toContain("The BCR assumes 25 MVA added, more than the DPR's 1x20 MVA.");
    expect(msgs.some((m) => m.includes('“Abstract I” in the workbook states 0 lakh'))).toBe(true);
  });

  it('blocks any abstract more than Rs 1,000 off the workbook, however large the estimate', () => {
    const e = buildTemplate(dpr);
    const ours = abstractOf(e, 'I').at(-1)!.lakhs;
    const at = (lakh: number) => crossChecks(dpr, e, contentOf(dpr, e), [{ sheet: 'SS ABS', part: 'I', title: '', total: lakh * 1e5 }]).filter((c) => c.id === 'abstract:I');
    expect(at(ours)).toEqual([]);
    expect(at(ours + 0.01)).toEqual([]);
    // Rs 2 lakh off on an 800-lakh estimate used to pass (the check allowed 0.5%, about Rs 4 lakh here).
    expect(at(ours + 2)).toMatchObject([{ severity: 'blocker' }]);
  });

  it('catches rows imported twice and a miscellaneous amount that is negative or too large', () => {
    const e = buildTemplate(dpr);
    const a = { ...e.lines[0]!, id: 'x1', source: 'boq.xlsx · SS Supply row 12' };
    e.lines = [...e.lines, a, { ...a, id: 'x2' }];
    e.misc = { ...e.misc, civil: -500, erection: 1e7 };
    const ids = estimateChecks(e).map((c) => `${c.id}:${c.severity}`);
    expect(ids).toEqual(expect.arrayContaining(['dup-rows:blocker', 'misc-neg:civil:blocker', 'misc-big:erection:warning']));
    // The sample template's lines share one source but are not copies.
    expect(estimateChecks(buildTemplate(dpr)).filter((c) => c.id === 'dup-rows')).toEqual([]);
  });

  it('works out the loading factor as the Thyavanige DPR does', () => {
    const load = { existing: '1x12.5 MVA', peakMw: 10.6, replacedMva: 0, powerFactor: 0.85 };
    const f = loadFigures(load, '1x20 MVA')!;
    expect(lf2(f.now)).toBe('0.99');
    expect(f.addedMva).toBe(20);
    expect(f.after.toFixed(2)).toBe('0.38');
    expect(existingCapacityText(load, '66/11 kV', f)).toBe('1×12.5 MVA, 66/11 kV — recorded peak load 10.6 MW, loading factor 0.99 (overloaded)');
    // A replacement: 2×8 out, 2×20 in, so 24 MVA added.
    expect(loadFigures({ existing: '2x8 MVA', peakMw: 11.6, replacedMva: 16, powerFactor: 0.85 }, '2x20 MVA')!.addedMva).toBe(24);
  });
});

describe('version history', () => {
  it('numbers versions and says what changed between them', async () => {
    const { diffVersions, listVersions, saveVersion, snapshot } = await import('./versions');
    const e = buildTemplate(dpr);
    const v1 = snapshot(dpr, e, EMPTY_DOCUMENTS, ['a', 'b'], [], new Date('2026-11-01'));
    saveVersion(v1);
    const e2 = structuredClone(e);
    e2.lines[0]!.qty += 1;
    e2.lines = e2.lines.filter((l) => l.code !== 'A1 b');
    e2.document = { ...contentOf(dpr, e2), sections: { ...contentOf(dpr, e2).sections, problems: '1. The 12.5 MVA transformer is overloaded.' } };
    const v2 = snapshot(dpr, e2, EMPTY_DOCUMENTS, ['a'], listVersions(dpr.id));
    expect(v2.version).toBe(2);
    const d = diffVersions(v1, v2);
    expect(d[0]).toMatch(/^Total cost .* lakh/);
    expect(d.some((x) => x.startsWith('1 BOQ item changed: A1 a'))).toBe(true);
    expect(d.some((x) => x.startsWith('1 BOQ item removed'))).toBe(true);
    expect(d).toContain('Text changed: Problems');
    expect(d).toContain('Missing items 2 → 1');
    expect(saveVersion(v2)).toHaveLength(2);
  });
});
