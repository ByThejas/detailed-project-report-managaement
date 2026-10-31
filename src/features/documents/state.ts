import { ALL_DOCUMENTS, type DocumentSpec } from './catalog';
import type { DocFile, DocStatus, DprDocuments } from './types';

export const filesOf = (d: DprDocuments, key: string): DocFile[] => d.files[key] ?? [];
export const isLocked = (d: DprDocuments) => Boolean(d.submittedAt);

/**
 * Awaiting = no file yet. Uploaded = file attached, not yet sent.
 * Pending = sent to the consultant and waiting for them. N/A = marked not applicable.
 */
export function statusOf(d: DprDocuments, key: string): DocStatus {
  if (d.notApplicable.includes(key)) return 'N/A';
  if (filesOf(d, key).length === 0) return 'Awaiting';
  return d.submittedAt ? 'Pending' : 'Uploaded';
}

export function countStatuses(d: DprDocuments) {
  const counts = { uploaded: 0, pending: 0, notReady: 0, notApplicable: 0 };
  for (const { key } of ALL_DOCUMENTS) {
    const s = statusOf(d, key);
    if (s === 'Uploaded') counts.uploaded += 1;
    else if (s === 'Pending') counts.pending += 1;
    else if (s === 'Awaiting') counts.notReady += 1;
    else counts.notApplicable += 1;
  }
  return counts;
}

export function missingMandatory(d: DprDocuments): DocumentSpec[] {
  return ALL_DOCUMENTS.filter((s) => s.requirement === 'Mandatory' && filesOf(d, s.key).length === 0);
}

export const canSubmit = (d: DprDocuments) => !isLocked(d) && missingMandatory(d).length === 0;

export function addFiles(d: DprDocuments, key: string, added: DocFile[]): DprDocuments {
  if (isLocked(d)) return d;
  return {
    ...d,
    files: { ...d.files, [key]: [...filesOf(d, key), ...added] },
    notApplicable: d.notApplicable.filter((k) => k !== key),
  };
}

export function removeFile(d: DprDocuments, key: string, index: number): DprDocuments {
  if (isLocked(d)) return d;
  return { ...d, files: { ...d.files, [key]: filesOf(d, key).filter((_, i) => i !== index) } };
}

export function setNotApplicable(d: DprDocuments, spec: DocumentSpec, value: boolean): DprDocuments {
  // Mandatory documents cannot be skipped, and a document with files is by definition applicable.
  if (isLocked(d) || spec.requirement === 'Mandatory' || filesOf(d, spec.key).length > 0) return d;
  const rest = d.notApplicable.filter((k) => k !== spec.key);
  return { ...d, notApplicable: value ? [...rest, spec.key] : rest };
}

export function submit(d: DprDocuments, now = new Date()): DprDocuments {
  return canSubmit(d) ? { ...d, submittedAt: now.toISOString() } : d;
}
