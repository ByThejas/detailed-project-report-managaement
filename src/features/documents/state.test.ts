import { ALL_DOCUMENTS } from './catalog';
import { addFiles, canSubmit, countStatuses, missingMandatory, removeFile, setNotApplicable, statusOf, submit } from './state';
import { EMPTY_DOCUMENTS, type DprDocuments } from './types';

const file = (name = 'a.pdf') => ({ name, size: 10, addedAt: '2026-10-31T00:00:00Z' });
const mandatory = ALL_DOCUMENTS.filter((d) => d.requirement === 'Mandatory');
const optional = ALL_DOCUMENTS.find((d) => d.requirement === 'Optional')!;

const withAllMandatory = () => mandatory.reduce<DprDocuments>((d, s) => addFiles(d, s.key, [file()]), EMPTY_DOCUMENTS);

describe('document state', () => {
  it('has 23 documents, 6 of them mandatory', () => {
    expect(ALL_DOCUMENTS).toHaveLength(23);
    expect(mandatory).toHaveLength(6);
  });

  it('starts with everything awaiting and nothing submittable', () => {
    expect(countStatuses(EMPTY_DOCUMENTS)).toEqual({ uploaded: 0, pending: 0, notReady: 23, notApplicable: 0 });
    expect(canSubmit(EMPTY_DOCUMENTS)).toBe(false);
    expect(missingMandatory(EMPTY_DOCUMENTS)).toHaveLength(6);
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

  it('can be submitted once every mandatory document has a file, then locks', () => {
    const ready = withAllMandatory();
    expect(canSubmit(ready)).toBe(true);
    const sent = submit(ready, new Date('2026-10-31T10:00:00Z'));
    expect(sent.submittedAt).toBe('2026-10-31T10:00:00.000Z');
    expect(countStatuses(sent)).toMatchObject({ pending: 6, uploaded: 0 });
    expect(addFiles(sent, optional.key, [file()])).toBe(sent);
    expect(canSubmit(sent)).toBe(false);
  });
});
