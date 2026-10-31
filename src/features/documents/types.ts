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
  /** Set once the DPR's documents have gone to the consultant. */
  submittedAt?: string;
}

export const EMPTY_DOCUMENTS: DprDocuments = { files: {}, notApplicable: [] };

export type DocStatus = 'Awaiting' | 'Uploaded' | 'Pending' | 'N/A';
