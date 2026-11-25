import 'fake-indexeddb/auto';
import { putFiles } from '@/lib/fileStore';
import { row } from '@/test/fixtures';
import { contentOf } from '../content';
import { AccessCodeNeeded, clearSourceCache, generateDraft, unverifiedNumbers, type DraftContext } from './generate';
import { scanDraft } from './scan';
import { handleDraft, selectPages } from '../../../../api/ai/draft';
import type { Estimate } from '@/features/preparation/types';

const TCCM = `PROCEEDINGS OF THE 6th TCCM of BESCOM (Brown Field) held on 24.09.2026 at Corporate Office.
Subject: Providing additional 1x20 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige substation in Channagiri Taluk, Davanagere District.
Subject No. 63. The present recorded peak load is 10.6 MW on the existing 1x12.5 MVA transformer.
The work is included in List - III of FY 2026-27, APW Code: BB1189.`;

const dpr = row({ id: 'DPR/DVG/2026/0001', project: '66/11 kV Thyavanige S/S', voltage: '66/11 kV', capacity: '1x20 MVA', stream: 'Brownfield', station: 'Thyavanige' });
const estimate = { lines: [], misc: { supply: 0, erection: 0, testing: 0, civil: 0 }, areaLoadingPct: 3, gstPct: 18, statutoryCharges: 0 } as unknown as Estimate;
const documents = { files: { 'tccm-proceedings': [{ name: 'tccm.txt', size: 1, addedAt: '2026-11-24T10:00:00.000Z' }] }, notApplicable: [] };
const ctx: DraftContext = { dpr, estimate, documents, content: contentOf(dpr, estimate) };
const texts = [{ file: 'tccm.txt', docKey: 'tccm-proceedings', pages: [TCCM] }];

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('drafting a Report text field from the uploaded documents', () => {
  beforeAll(async () => {
    await putFiles(dpr.id, 'tccm-proceedings', [new File([TCCM], 'tccm.txt', { type: 'text/plain' })]);
  });
  beforeEach(() => clearSourceCache());
  afterEach(() => vi.unstubAllGlobals());

  it('drafts from the file scan when AI drafting is not set up, with the source of each fact', async () => {
    vi.stubGlobal('fetch', reply(501, { error: 'not-configured' }));
    const d = await generateDraft({ kind: 'section', key: 'approvals' }, ctx);
    expect(d.engine).toBe('scan');
    expect(d.text).toBe('The subject work was approved in the 6th TCCM of BESCOM (Brown Field) held on 24.09.2026, Subject-63.');
    expect(d.citations[0]).toMatchObject({ file: 'tccm.txt' });
    expect(d.missing).toEqual([]);
    expect(d.unverified).toEqual([]);
    expect(d.notes.join(' ')).toMatch(/AI drafting is not set up/);
  });

  it('says what is missing instead of inventing text the scan cannot find', async () => {
    vi.stubGlobal('fetch', reply(404, {}));
    const d = await generateDraft({ kind: 'section', key: 'alternatives' }, ctx);
    expect(d.text).toMatch(/^\[missing: /);
    expect(d.missing).toHaveLength(1);
    const sig = await generateDraft({ kind: 'detail', key: 'preparedBy' }, ctx);
    expect(sig.engine).toBe('app');
    expect(sig.missing[0]).toMatch(/who prepares the DPR/);
  });

  it('sends the files’ text and known facts to the AI route and returns its cited draft', async () => {
    const fetch = reply(200, { text: 'The work was approved in the 6th TCCM held on 24.09.2026 for 99 MVA.', citations: [{ file: 'tccm.txt', quote: '6th TCCM' }], trimmed: [] });
    vi.stubGlobal('fetch', fetch);
    const d = await generateDraft({ kind: 'detail', key: 'approval' }, ctx, 'old text');
    expect(d.engine).toBe('ai');
    expect(d.citations).toHaveLength(1);
    // 99 appears in no document: flagged for checking.
    expect(d.unverified).toEqual(['99']);
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.field.label).toBe('Approval');
    expect(body.current).toBe('old text');
    expect(body.files[0]).toMatchObject({ name: 'tccm.txt', docKey: 'tccm-proceedings', docName: 'TCCM Proceedings' });
    expect(body.facts['Capacity added']).toBe('1x20 MVA');
  });

  it('asks for the team passcode when the server wants one', async () => {
    vi.stubGlobal('fetch', reply(401, { error: 'access-code' }));
    await expect(generateDraft({ kind: 'detail', key: 'approval' }, ctx)).rejects.toBeInstanceOf(AccessCodeNeeded);
  });

  it('fills set texts from the app, not the documents', async () => {
    const d = await generateDraft({ kind: 'section', key: 'expenditure' }, ctx);
    expect(d.engine).toBe('app');
    expect(d.text).toMatch(/80% of the awarded amount/);
  });
});

describe('file scan drafts', () => {
  it('finds the name of work, taluk and district, budget and approval', () => {
    expect(scanDraft({ kind: 'detail', key: 'nameOfWork' }, texts, ctx).text).toBe('Providing additional 1x20 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige substation in Channagiri Taluk, Davanagere District.');
    expect(scanDraft({ kind: 'detail', key: 'coverSubtitle' }, texts, ctx).text).toBe('Channagiri Taluk, Davanagere District.');
    expect(scanDraft({ kind: 'section', key: 'budget' }, texts, ctx).text).toBe('The subject work is included in List – III, FY 2026-27 APW Code: BB1189.');
    expect(scanDraft({ kind: 'salient', label: 'Earthing materials' }, texts, ctx).text).toMatch(/^\[missing: earthmat drawing/);
  });

  it('flags numbers that appear in no document', () => {
    expect(unverifiedNumbers('1. Loaded to 10.6 MW on 1×12.5 MVA in FY 2026-27, Subject-63.', texts, {})).toEqual([]);
    expect(unverifiedNumbers('Approved on 25.09.2026 [missing: 17 things]', texts, {})).toEqual(['25.09.2026']);
  });
});

describe('AI drafting route', () => {
  it('answers 501 without an API key and 401 without the team passcode', async () => {
    expect((await handleDraft('POST', {}, undefined, {})).status).toBe(501);
    expect((await handleDraft('POST', {}, 'nope', { ANTHROPIC_API_KEY: 'k', AI_ACCESS_CODE: 'team' })).status).toBe(401);
    expect((await handleDraft('GET', undefined, 'team', { ANTHROPIC_API_KEY: 'k', AI_ACCESS_CODE: 'team' })).status).toBe(200);
    expect((await handleDraft('POST', { files: [] }, undefined, { ANTHROPIC_API_KEY: 'k' })).status).toBe(400);
  });

  it('sends the documents the field needs first and trims whole pages past the limit', () => {
    const big = 'x'.repeat(400_000);
    const out = selectPages(
      [
        { name: 'survey.pdf', docKey: 'survey-report', docName: 'Survey Report', pages: [big] },
        { name: 'tccm.pdf', docKey: 'tccm-proceedings', docName: 'TCCM Proceedings', pages: ['a', big] },
      ],
      ['tccm-proceedings'],
    );
    expect(out.files.map((f) => f.name)).toEqual(['tccm.pdf']);
    expect(out.trimmed).toEqual(['survey.pdf']);
  });
});
