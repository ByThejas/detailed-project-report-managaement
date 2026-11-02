import { ALL_DOCUMENTS, PREPARATION_INPUTS } from './catalog';
import { addExtraDocument, addFiles, allDocsOf, canSubmit, changesSinceSubmit, countStatuses, missingMandatory, removeExtraDocument, removeFile, setNotApplicable, statusOf, submit } from './state';
import { EMPTY_DOCUMENTS, type DprDocuments } from './types';

const file = (name = 'a.pdf') => ({ name, size: 10, addedAt: '2026-10-31T00:00:00Z' });
const mandatory = ALL_DOCUMENTS.filter((d) => d.requirement === 'Mandatory');
const optional = ALL_DOCUMENTS.find((d) => d.requirement === 'Optional')!;

const withAllMandatory = () => mandatory.reduce<DprDocuments>((d, s) => addFiles(d, s.key, [file()]), EMPTY_DOCUMENTS);

describe('document state', () => {
  it('has 24 documents, 7 of them mandatory', () => {
    expect(ALL_DOCUMENTS).toHaveLength(24);
    expect(mandatory).toHaveLength(7);
  });

  it('knows every preparation input', () => {
    const keys = ALL_DOCUMENTS.map((d) => d.key);
    PREPARATION_INPUTS.forEach((k) => expect(keys).toContain(k));
  });

  it('starts with everything awaiting and nothing submittable', () => {
    expect(countStatuses(EMPTY_DOCUMENTS)).toEqual({ uploaded: 0, pending: 0, notReady: 24, notApplicable: 0 });
    expect(canSubmit(EMPTY_DOCUMENTS)).toBe(false);
    expect(missingMandatory(EMPTY_DOCUMENTS)).toHaveLength(7);
  });

  it('marks a document uploaded when a file is attached, and awaiting again when removed', () => {
    const d = addFiles(EMPTY_DOCUMENTS, optional.key, [file()]);
    expect(statusOf(d, optional.key)).toBe('Uploaded');
    expect(statusOf(removeFile(d, optional.key, 0), optional.key)).toBe('Awaiting');
  });

  it('allows N/A only for optional documents without files', () => {
    expect(statusOf(setNotApplicable(EMPTY_DOCUMENTS, optional, true), optional.key)).toBe('N/A');
    expect(setNotApplicable(EMPTY_DOCUMENTS, mandatory[0]!, true)).toBe(EMPTY_DOCUMENTS);
    const withFile = addFiles(EMPTY_DOCUMENTS, optional.key, [file()]);
    expect(setNotApplicable(withFile, optional, true)).toBe(withFile);
  });

  it('can be submitted once every mandatory document has a file, and stays open for changes and updates', () => {
    const ready = withAllMandatory();
    expect(canSubmit(ready)).toBe(true);
    const sent = submit(ready, new Date('2026-10-31T10:00:00Z'));
    expect(sent.submittedAt).toBe('2026-10-31T10:00:00.000Z');
    expect(countStatuses(sent)).toMatchObject({ pending: 7, uploaded: 0 });
    // Nothing changed, so there is nothing to send again.
    expect(canSubmit(sent)).toBe(false);
    const more = addFiles(sent, optional.key, [{ ...file('tac.pdf'), addedAt: '2026-11-01T00:00:00Z' }]);
    expect(statusOf(more, optional.key)).toBe('Uploaded');
    expect(changesSinceSubmit(more).map((c) => c.text)).toEqual([`Added tac.pdf to ${optional.name}`]);
    expect(canSubmit(more)).toBe(true);
    const update = submit(more, new Date('2026-11-01T10:00:00Z'));
    expect(update.submissions!.map((x) => x.changes)).toEqual([[], [`Added tac.pdf to ${optional.name}`]]);
    expect(statusOf(update, optional.key)).toBe('Pending');
    expect(changesSinceSubmit(update)).toEqual([]);
  });

  it('adds optional documents for one DPR, and removes them only while they have no files', () => {
    let d = addExtraDocument(EMPTY_DOCUMENTS, '  Forest  NOC ', 'Operations');
    expect(d.extra).toEqual([{ key: 'extra-forest-noc', name: 'Forest NOC', source: 'Operations' }]);
    expect(addExtraDocument(d, 'forest noc', 'Other')).toBe(d);
    expect(addExtraDocument(d, 'TCCM Proceedings', 'Other')).toBe(d);
    expect(allDocsOf(d)).toHaveLength(25);
    expect(countStatuses(d).notReady).toBe(25);
    expect(missingMandatory(d)).toHaveLength(7);
    d = addFiles(d, 'extra-forest-noc', [file('noc.pdf')]);
    expect(removeExtraDocument(d, 'extra-forest-noc')).toBe(d);
    d = removeFile(d, 'extra-forest-noc', 0);
    expect(removeExtraDocument(d, 'extra-forest-noc').extra).toEqual([]);
  });
});

describe('department request drafts', () => {
  it('drafts one letter per department for the mandatory documents still awaited', async () => {
    const { requestDrafts, mailtoOf } = await import('./requests');
    const { row } = await import('@/test/fixtures');
    const dpr = row({ division: 'PEENYA' });
    const drafts = requestDrafts(dpr, EMPTY_DOCUMENTS);
    expect(drafts.map((d) => d.department)).toEqual(['Operations', 'P&C', 'R&D']);
    const ops = drafts[0]!;
    expect(ops.to).toBe('The Executive Engineer (Ele), Peenya Operations Division, KPTCL');
    expect(ops.body).toContain('1. TCCM Proceedings');
    expect(ops.body).not.toContain('TCCM Proposal');
    expect(ops.subject).toContain(dpr.id);
    expect(mailtoOf(ops)).toMatch(/^mailto:\?subject=/);
    expect(requestDrafts(dpr, EMPTY_DOCUMENTS, true).find((d) => d.department === 'Operations')!.body).toContain('TCCM Proposal (if applicable)');
  });
});
