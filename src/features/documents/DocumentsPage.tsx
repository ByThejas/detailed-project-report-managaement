import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Send, CircleSlash, FileStack, FolderOpen, Plus, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActiveDprPicker } from '@/features/dprs/ActiveDprPicker';
import { DprSummaryHeader } from '@/features/dprs/DprSummaryHeader';
import { useActiveDpr } from '@/features/dprs/useActiveDpr';
import { useToast } from '@/lib/toast';
import { useDprDocuments, useUpdateDocuments } from './api';
import { DOCUMENT_GROUPS, pdfOnly } from './catalog';
import { DocumentTable } from './DocumentTable';
import { RequestDraftsCard } from './RequestDraftsCard';
import { deleteFile, putFiles } from '@/lib/fileStore';
import { addExtraDocument, addFiles, canSubmit, changesSinceSubmit, extraSpecs, filesOf, countStatuses, missingMandatory, removeExtraDocument, removeFile, setNotApplicable, submit } from './state';
import { AddDocumentForm } from './AddDocumentForm';
import { EMPTY_DOCUMENTS } from './types';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function SummaryStrip({ counts }: { counts: ReturnType<typeof countStatuses> }) {
  const items = [
    { label: 'Uploaded', value: counts.uploaded, icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Submitted', value: counts.submitted, icon: Send, tone: 'text-violet-600' },
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

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function DocumentsPage() {
  const { dprs, active, choose: setDpr } = useActiveDpr();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const activeId = active?.id ?? '';
  const rows = dprs.data ?? [];

  const documents = useDprDocuments(activeId);
  const update = useUpdateDocuments(activeId);
  const docs = documents.data ?? EMPTY_DOCUMENTS;
  const submitted = Boolean(docs.submittedAt);
  const changes = changesSinceSubmit(docs);
  const missing = missingMandatory(docs);

  const choose = (id: string) => {
    setConfirming(false);
    setDpr(id);
  };

  const attach = (spec: { key: string; name: string }, picked: File[]) => {
    let files = picked;
    const notPdf = pdfOnly(spec.key) ? files.filter((f) => !/\.pdf$/i.test(f.name)) : [];
    if (notPdf.length) toast({ title: 'PDF only', description: `${spec.name} takes the BOQ PDF as received. Upload the estimated BOQ workbook in DPR Preparation, Estimate tab. Skipped: ${notPdf.map((f) => f.name).join(', ')}.`, tone: 'error' });
    files = files.filter((f) => !notPdf.includes(f));
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) toast({ title: 'File too large', description: `${tooBig.map((f) => f.name).join(', ')} is over 25 MB.`, tone: 'error' });
    if (!ok.length) return;
    const added = ok.map((f) => ({ name: f.name, size: f.size, addedAt: new Date().toISOString() }));
    // Keep the files themselves in this browser, for the printed DPR pack.
    void putFiles(activeId, spec.key, ok);
    update.mutate((d) => addFiles(d, spec.key, added), {
      onSuccess: () => toast({ title: `${ok.length === 1 ? 'File' : `${ok.length} files`} added`, description: spec.name }),
    });
  };

  const remove = (spec: { key: string }, index: number) => {
    const name = filesOf(docs, spec.key)[index]?.name;
    update.mutate((d) => removeFile(d, spec.key, index));
    if (name && !filesOf(docs, spec.key).some((f, i) => i !== index && f.name === name)) void deleteFile(activeId, spec.key, name);
  };

  const send = () => {
    update.mutate(submit, {
      onSuccess: () => {
        setConfirming(false);
        toast({ title: submitted ? 'Update submitted for DPR preparation' : 'Submitted for DPR preparation', description: activeId });
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
        {submitted && (
          <div role="status" className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-700">
            <p>
              Last submitted for DPR preparation on {when(docs.submittedAt!)}
              {(docs.submissions?.length ?? 0) > 1 && ` (${docs.submissions!.length} submissions)`}. You can still add, remove or change documents and submit an update.
            </p>
            {changes.length > 0 && (
              <>
                <p className="mt-1.5 font-medium text-gray-900">Changed since then</p>
                <ul aria-label="Changes since the last submission" className="mt-0.5 list-disc pl-5 text-xs">
                  {changes.map((c, i) => (
                    <li key={i}>{c.text}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
        <DocumentTable
          key={`${activeId}-extra`}
          group={{ key: 'extra', title: 'Additional documents', documents: extraSpecs(docs) }}
          docs={docs}
          onAdd={attach}
          onRemove={remove}
          onNotApplicable={(spec, value) => update.mutate((d) => setNotApplicable(d, spec, value))}
          onRemoveDocument={(spec) => update.mutate((d) => removeExtraDocument(d, spec.key))}
          emptyText="Documents this DPR needs beyond the standard list, e.g. a forest NOC or a railway crossing approval. Add one below."
          footer={
            <AddDocumentForm
              existing={[...DOCUMENT_GROUPS.flatMap((g) => g.documents), ...extraSpecs(docs)].map((d) => d.name)}
              onAdd={(name, source) => update.mutate((d) => addExtraDocument(d, name, source), { onSuccess: () => toast({ title: 'Document added', description: name }) })}
            />
          }
        />
        {active && <RequestDraftsCard dpr={active} docs={docs} />}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {confirming ? (
            <div role="alertdialog" aria-label="Confirm submission" className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[13px]">
              <span className="text-gray-700">{submitted ? `Submit an update with ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} for DPR preparation?` : 'Submit these documents for DPR preparation? You can still change them and submit an update later.'}</span>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={send} disabled={update.isPending}>
                {submitted ? 'Yes, submit update' : 'Yes, submit'}
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn-primary" disabled={!canSubmit(docs)} onClick={() => setConfirming(true)}>
                {submitted ? 'Submit update for DPR preparation' : 'Submit for DPR preparation'}
              </button>
              {submitted && !changes.length && <p className="text-xs text-gray-500">Nothing has changed since the last submission.</p>}
              {missing.length > 0 && (
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
      <PageHeader title="Documents" description="Attach the documents each DPR needs, then submit them for DPR preparation." />
      <div className="space-y-4">
        <ActiveDprPicker rows={rows} value={activeId} onChange={choose} />
        {active && <DprSummaryHeader dpr={active} />}
        {body}
      </div>
    </div>
  );
}
