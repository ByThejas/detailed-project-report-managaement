import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleSlash, Clock, FileStack, FolderOpen, Plus, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActiveDprPicker } from '@/features/dprs/ActiveDprPicker';
import { useActiveDpr } from '@/features/dprs/useActiveDpr';
import { useToast } from '@/lib/toast';
import { BOQ_DOCUMENTS, useReadBoqFiles, useRemoveBoqRead } from '@/features/boq-import/api';
import { useDprDocuments, useUpdateDocuments } from './api';
import { DOCUMENT_GROUPS } from './catalog';
import { DocumentTable } from './DocumentTable';
import { addFiles, canSubmit, filesOf, countStatuses, isLocked, missingMandatory, removeFile, setNotApplicable, submit } from './state';
import { EMPTY_DOCUMENTS } from './types';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function SummaryStrip({ counts }: { counts: ReturnType<typeof countStatuses> }) {
  const items = [
    { label: 'Uploaded', value: counts.uploaded, icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Pending', value: counts.pending, icon: Clock, tone: 'text-amber-600' },
    { label: 'Not ready', value: counts.notReady, icon: TriangleAlert, tone: 'text-rose-600' },
    { label: 'N/A', value: counts.notApplicable, icon: CircleSlash, tone: 'text-gray-500' },
  ];
  return (
    <section aria-label="Document summary">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 lg:grid-cols-4">
        {items.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-white px-4 py-3.5">
            <dt className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icon className={`h-3.5 w-3.5 ${tone}`} strokeWidth={1.75} aria-hidden />
              {label}
            </dt>
            <dd className="num mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DocumentsPage() {
  const { dprs, active, choose: setDpr } = useActiveDpr();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const activeId = active?.id ?? '';
  const rows = dprs.data ?? [];

  const documents = useDprDocuments(activeId);
  const update = useUpdateDocuments(activeId);
  const readBoq = useReadBoqFiles(activeId);
  const removeRead = useRemoveBoqRead(activeId);
  const docs = documents.data ?? EMPTY_DOCUMENTS;
  const locked = isLocked(docs);
  const missing = missingMandatory(docs);

  const choose = (id: string) => {
    setConfirming(false);
    setDpr(id);
  };

  const attach = (spec: { key: string; name: string }, files: File[]) => {
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) toast({ title: 'File too large', description: `${tooBig.map((f) => f.name).join(', ')} is over 25 MB.`, tone: 'error' });
    if (!ok.length) return;
    const added = ok.map((f) => ({ name: f.name, size: f.size, addedAt: new Date().toISOString() }));
    update.mutate((d) => addFiles(d, spec.key, added), {
      onSuccess: () => toast({ title: `${ok.length === 1 ? 'File' : `${ok.length} files`} added`, description: spec.name }),
    });
    if (BOQ_DOCUMENTS[spec.key]) readBoqFiles(spec.key, ok);
  };

  // BOQ workbooks are read straight away so DPR Preparation can offer their items for review.
  const readBoqFiles = (docKey: string, files: File[]) =>
    readBoq.mutate(
      { docKey, files },
      {
        onSuccess: ({ results, unreadable }) => {
          for (const r of results) {
            toast(
              r.failure
                ? { title: `Could not read ${r.fileName}`, description: r.failure, tone: 'error' }
                : { title: `Read ${r.items.length} items from ${r.fileName}`, description: 'Review and import them in DPR Preparation.' },
            );
          }
          if (unreadable.length) toast({ title: 'Attached, not read', description: `Quantities are read from .xlsx files only: ${unreadable.join(', ')}.`, tone: 'info' });
        },
      },
    );

  const remove = (spec: { key: string }, index: number) => {
    const name = filesOf(docs, spec.key)[index]?.name;
    update.mutate((d) => removeFile(d, spec.key, index));
    if (name && BOQ_DOCUMENTS[spec.key] && !filesOf(docs, spec.key).some((f, i) => i !== index && f.name === name)) removeRead.mutate({ docKey: spec.key, fileName: name });
  };

  const send = () => {
    update.mutate(submit, {
      onSuccess: () => {
        setConfirming(false);
        toast({ title: 'Submitted to consultant', description: activeId });
      },
    });
  };

  let body;
  if (dprs.isPending) {
    body = <div className="h-24 animate-pulse rounded-lg bg-gray-100" aria-label="Loading DPRs" />;
  } else if (rows.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon={FileStack}
          title="No DPRs yet"
          hint="Documents are attached to a DPR. Initialize one first, then come back here."
          action={
            <Link to="/initialization" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden />
              Create your first DPR
            </Link>
          }
        />
      </Card>
    );
  } else if (!activeId) {
    body = (
      <Card>
        <EmptyState icon={FolderOpen} title="Select a DPR" hint="Search by DPR ID or project name above. The documents it needs will appear here." />
      </Card>
    );
  } else {
    body = (
      <>
        <SummaryStrip counts={countStatuses(docs)} />
        {locked && (
          <p role="status" className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-700">
            Submitted to the consultant on {new Date(docs.submittedAt!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. Files can no longer be changed.
          </p>
        )}
        {DOCUMENT_GROUPS.map((group) => (
          <DocumentTable
            key={`${activeId}-${group.key}`}
            group={group}
            docs={docs}
            onAdd={attach}
            onRemove={remove}
            onNotApplicable={(spec, value) => update.mutate((d) => setNotApplicable(d, spec, value))}
          />
        ))}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {confirming ? (
            <div role="alertdialog" aria-label="Confirm submission" className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[13px]">
              <span className="text-gray-700">Send these documents to the consultant? You won’t be able to change files afterwards.</span>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={send} disabled={update.isPending}>
                Yes, submit
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn-primary" disabled={!canSubmit(docs)} onClick={() => setConfirming(true)}>
                Submit to Consultant
              </button>
              {!locked && missing.length > 0 && (
                <p className="text-xs text-gray-500">
                  {missing.length} mandatory {missing.length === 1 ? 'document' : 'documents'} still needed: {missing.map((m) => m.name).join(', ')}.
                </p>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Documents" description="Attach the documents each DPR needs, then send them to the consultant." />
      <div className="space-y-4">
        <ActiveDprPicker rows={rows} value={activeId} onChange={choose} />
        {body}
      </div>
    </div>
  );
}
