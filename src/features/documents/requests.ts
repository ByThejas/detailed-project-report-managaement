import type { DprRow } from '@/features/reports/types';
import type { DocumentSpec } from './catalog';
import { allDocsOf, statusOf } from './state';
import type { DprDocuments } from './types';

/** A drafted letter asking one department for the documents it still owes. Never sent by the app. */
export interface RequestDraft {
  department: string;
  to: string;
  documents: DocumentSpec[];
  subject: string;
  body: string;
}

/** Who to address in each department, as KPTCL letters do. */
function addressee(source: string, dpr: DprRow): string {
  switch (source) {
    case 'Operations':
      return `The Executive Engineer (Ele), ${dpr.division ? `${titleCase(dpr.division)} ` : ''}Operations Division, KPTCL`;
    case 'P&C':
      return 'The Chief Engineer (Ele), Planning & Co-ordination, KPTCL';
    case 'R&D':
      return 'The Superintending Engineer (Ele), Research & Development, KPTCL';
    case 'SCADA':
      return 'The Executive Engineer (Ele), SCADA Division, KPTCL';
    case 'Civil':
      return 'The Executive Engineer (Civil), KPTCL';
    default:
      return 'The concerned officer, KPTCL';
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** One draft per department that still owes documents for this DPR (Awaiting, not N/A). Documents added for this DPR are always asked for. */
export function requestDrafts(dpr: DprRow, docs: DprDocuments, includeOptional = false): RequestDraft[] {
  const owed = allDocsOf(docs).filter((d) => statusOf(docs, d.key) === 'Awaiting' && (includeOptional || d.requirement === 'Mandatory' || d.key.startsWith('extra-')));
  const bySource = new Map<string, DocumentSpec[]>();
  for (const d of owed) bySource.set(d.source, [...(bySource.get(d.source) ?? []), d]);
  return [...bySource].map(([department, documents]) => {
    const to = addressee(department, dpr);
    const subject = `${dpr.id}: documents required for the DPR of ${dpr.project}`;
    const list = documents.map((d, i) => `${i + 1}. ${d.name}${d.requirement === 'Optional' ? ' (if applicable)' : ''}`).join('\n');
    const body = [
      'To,',
      to,
      '',
      'Sir,',
      '',
      `Sub: Furnishing of documents for preparation of the Detailed Project Report — ${dpr.project}${dpr.location ? `, ${dpr.location}` : ''}.`,
      `Ref: DPR ${dpr.id} (${dpr.voltage}, ${dpr.capacity}, ${dpr.stream}).`,
      '',
      'The following documents are required to complete the DPR for the above work. You are requested to furnish them at the earliest:',
      '',
      list,
      '',
      'Yours faithfully,',
      '',
      '',
    ].join('\n');
    return { department, to, documents, subject, body };
  });
}

/** A mailto: link that opens the draft in the user's email app. The user picks the recipient and sends it. */
export const mailtoOf = (r: RequestDraft) => `mailto:?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}`;
