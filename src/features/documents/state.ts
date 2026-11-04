import { ALL_DOCUMENTS, type DocumentSpec } from './catalog';
import type { DocFile, DocStatus, DprDocuments, ExtraDocument } from './types';

export const filesOf = (d: DprDocuments, key: string): DocFile[] => d.files[key] ?? [];

/** Extra documents added for this DPR, as optional document specs. */
export const extraSpecs = (d: DprDocuments): DocumentSpec[] => (d.extra ?? []).map((x) => ({ ...x, requirement: 'Optional' as const }));

/** The standard documents plus this DPR's extra ones. */
export const allDocsOf = (d: DprDocuments): DocumentSpec[] => [...ALL_DOCUMENTS, ...extraSpecs(d)];

const nameOf = (d: DprDocuments, key: string) => allDocsOf(d).find((s) => s.key === key)?.name ?? key;

/**
 * Awaiting = no file yet. Uploaded = a file not yet submitted (new, or added since the last submission).
 * Submitted = submitted for DPR preparation. N/A = marked not applicable.
 */
export function statusOf(d: DprDocuments, key: string): DocStatus {
  if (d.notApplicable.includes(key)) return 'N/A';
  const files = filesOf(d, key);
  if (files.length === 0) return 'Awaiting';
  if (!d.submittedAt) return 'Uploaded';
  return files.some((f) => f.addedAt > d.submittedAt!) ? 'Uploaded' : 'Submitted';
}

export function countStatuses(d: DprDocuments) {
  const counts = { uploaded: 0, submitted: 0, notReady: 0, notApplicable: 0 };
  for (const { key } of allDocsOf(d)) {
    const s = statusOf(d, key);
    if (s === 'Uploaded') counts.uploaded += 1;
    else if (s === 'Submitted') counts.submitted += 1;
    else if (s === 'Awaiting') counts.notReady += 1;
    else counts.notApplicable += 1;
  }
  return counts;
}

export function missingMandatory(d: DprDocuments): DocumentSpec[] {
  return ALL_DOCUMENTS.filter((s) => s.requirement === 'Mandatory' && filesOf(d, s.key).length === 0);
}

/** Changes made since the last submission. */
export const changesSinceSubmit = (d: DprDocuments) => (d.submittedAt ? d.changes ?? [] : []);

/** First submission needs every mandatory file; after that, any change can be sent as an update. */
export const canSubmit = (d: DprDocuments) => missingMandatory(d).length === 0 && (!d.submittedAt || changesSinceSubmit(d).length > 0);

const logged = (d: DprDocuments, text: string, now = new Date()): DprDocuments => (d.submittedAt ? { ...d, changes: [...(d.changes ?? []), { at: now.toISOString(), text }] } : d);

export function addFiles(d: DprDocuments, key: string, added: DocFile[]): DprDocuments {
  const next = {
    ...d,
    files: { ...d.files, [key]: [...filesOf(d, key), ...added] },
    notApplicable: d.notApplicable.filter((k) => k !== key),
  };
  return logged(next, `Added ${added.map((f) => f.name).join(', ')} to ${nameOf(d, key)}`);
}

export function removeFile(d: DprDocuments, key: string, index: number): DprDocuments {
  const f = filesOf(d, key)[index];
  if (!f) return d;
  return logged({ ...d, files: { ...d.files, [key]: filesOf(d, key).filter((_, i) => i !== index) } }, `Removed ${f.name} from ${nameOf(d, key)}`);
}

export function setNotApplicable(d: DprDocuments, spec: DocumentSpec, value: boolean): DprDocuments {
  // Mandatory documents cannot be skipped, and a document with files is by definition applicable.
  if (spec.requirement === 'Mandatory' || filesOf(d, spec.key).length > 0) return d;
  const rest = d.notApplicable.filter((k) => k !== spec.key);
  return logged({ ...d, notApplicable: value ? [...rest, spec.key] : rest }, `${spec.name} marked ${value ? 'not applicable' : 'applicable'}`);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Adds an optional document for this DPR only. Returns the documents unchanged if the name is empty or already used. */
export function addExtraDocument(d: DprDocuments, name: string, source: string): DprDocuments {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n || allDocsOf(d).some((s) => s.name.toLowerCase() === n.toLowerCase())) return d;
  let key = `extra-${slug(n) || 'document'}`;
  for (let i = 2; allDocsOf(d).some((s) => s.key === key); i++) key = `extra-${slug(n)}-${i}`;
  const doc: ExtraDocument = { key, name: n, source: source.trim() || 'Other' };
  return logged({ ...d, extra: [...(d.extra ?? []), doc] }, `Added document “${n}”`);
}

/** Removes an extra document; only when it has no files. */
export function removeExtraDocument(d: DprDocuments, key: string): DprDocuments {
  const doc = d.extra?.find((x) => x.key === key);
  if (!doc || filesOf(d, key).length) return d;
  return logged({ ...d, extra: d.extra!.filter((x) => x.key !== key), notApplicable: d.notApplicable.filter((k) => k !== key) }, `Removed document “${doc.name}”`);
}

/** Submits the documents for DPR preparation: the first time, or again as an update listing what changed. */
export function submit(d: DprDocuments, now = new Date()): DprDocuments {
  if (!canSubmit(d)) return d;
  const changes = changesSinceSubmit(d).map((c) => c.text);
  return { ...d, submittedAt: now.toISOString(), changes: [], submissions: [...(d.submissions ?? []), { at: now.toISOString(), changes }] };
}
