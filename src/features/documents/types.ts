/** What we keep about an attached file. The file itself goes to the backend once there is one. */
export interface DocFile {
  name: string;
  size: number;
  addedAt: string;
}

export interface DprDocuments {
  /** Attached files by document key. */
  files: Record<string, DocFile[]>;
  /** Optional documents marked "not applicable" for this DPR. */
  notApplicable: string[];
  /** When the documents were last submitted for DPR preparation. Files can still be changed afterwards. */
  submittedAt?: string;
  /** Extra optional documents added for this DPR only, beyond the standard list. */
  extra?: ExtraDocument[];
  /** What changed since the last submission, so the next one can say so. */
  changes?: DocChange[];
  /** Earlier submissions, oldest first. */
  submissions?: Submission[];
}

export interface ExtraDocument {
  key: string;
  name: string;
  source: string;
}

export interface DocChange {
  at: string;
  text: string;
}

export interface Submission {
  at: string;
  /** What changed since the submission before it; empty for the first. */
  changes: string[];
}

export const EMPTY_DOCUMENTS: DprDocuments = { files: {}, notApplicable: [] };

export type DocStatus = 'Awaiting' | 'Uploaded' | 'Submitted' | 'N/A';
