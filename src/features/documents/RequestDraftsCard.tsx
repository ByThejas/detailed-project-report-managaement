import { useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/lib/toast';
import type { DprRow } from '@/features/reports/types';
import { mailtoOf, requestDrafts } from './requests';
import type { DprDocuments } from './types';

/**
 * Drafts one letter per department for the documents still awaited. The app never sends anything: the
 * user copies the text or opens it in their own email app, then checks and sends it.
 */
export function RequestDraftsCard({ dpr, docs }: { dpr: DprRow; docs: DprDocuments }) {
  const toast = useToast();
  const [optional, setOptional] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const drafts = requestDrafts(dpr, docs, optional);

  const copy = async (text: string, dept: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Draft copied', description: dept });
    } catch {
      toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', tone: 'error' });
    }
  };

  return (
    <Card role="region" aria-labelledby="requests-title">
      <CardHeader
        id="requests-title"
        title="Request missing documents"
        subtitle="Drafted letters, one per department. Nothing is sent: copy a draft or open it in your email app, check it, and send it yourself."
        action={
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={optional} onChange={(ev) => setOptional(ev.target.checked)} />
            Include optional documents
          </label>
        }
      />
      {!drafts.length ? (
        <p role="status" className="px-4 py-3 text-[13px] text-gray-500">
          No {optional ? '' : 'mandatory '}documents are awaited.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 text-[13px]">
          {drafts.map((d) => (
            <li key={d.department} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{d.department}</span>
                <span className="text-xs text-gray-500">{d.documents.map((x) => x.name).join(', ')}</span>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" className="btn-ghost h-7 px-2 text-xs" aria-expanded={open === d.department} onClick={() => setOpen(open === d.department ? null : d.department)}>
                    {open === d.department ? 'Hide draft' : 'Show draft'}
                  </button>
                  <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => copy(`${d.subject}\n\n${d.body}`, d.department)}>
                    <Copy className="h-3 w-3" aria-hidden /> Copy
                  </button>
                  <a className="btn-secondary h-7 px-2 text-xs" href={mailtoOf(d)}>
                    <Mail className="h-3 w-3" aria-hidden /> Open in email
                  </a>
                </span>
              </div>
              {open === d.department && (
                <pre aria-label={`Draft to ${d.department}`} className="mt-2 whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-sans text-xs text-gray-800">
                  {`Subject: ${d.subject}\n\n${d.body}`}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
