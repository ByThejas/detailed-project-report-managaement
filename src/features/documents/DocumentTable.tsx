import { Fragment, useMemo, useRef, useState } from 'react';
import { ChevronRight, Paperclip, Search, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import type { DocumentGroup, DocumentSpec } from './catalog';
import { filesOf, isLocked, statusOf } from './state';
import type { DocStatus, DprDocuments } from './types';

const PAGE_SIZE = 15;

const statusTone: Record<DocStatus, BadgeTone> = { Awaiting: 'gray', Uploaded: 'green', Pending: 'violet', 'N/A': 'gray' };

const formatSize = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

interface DocumentTableProps {
  group: DocumentGroup;
  docs: DprDocuments;
  onAdd: (spec: DocumentSpec, files: File[]) => void;
  onRemove: (spec: DocumentSpec, index: number) => void;
  onNotApplicable: (spec: DocumentSpec, value: boolean) => void;
}

export function DocumentTable({ group, docs, onAdd, onRemove, onNotApplicable }: DocumentTableProps) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<DocumentSpec | null>(null);
  const locked = isLocked(docs);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? group.documents.filter((d) => `${d.name} ${d.source} ${d.requirement}`.toLowerCase().includes(q)) : group.documents;
  }, [group.documents, filter]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const titleId = `${group.key}-docs-title`;

  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader id={titleId} title={group.title} subtitle={`${group.documents.length} documents`} />
      <div className="px-4 py-2.5">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            aria-label={`Filter ${group.title.toLowerCase()}`}
            placeholder="Filter…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            className="input pl-8"
          />
        </div>
      </div>

      <input
        ref={picker}
        type="file"
        multiple
        hidden
        data-testid={`${group.key}-file-input`}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (target.current && files.length) {
            onAdd(target.current, files);
            setOpen(target.current.key);
          }
          e.target.value = '';
        }}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th scope="col" className="px-4 py-2 font-medium">Document</th>
              <th scope="col" className="px-4 py-2 font-medium">Source</th>
              <th scope="col" className="px-4 py-2 font-medium">Requirement</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Files</th>
              <th scope="col" className="w-10 px-2 py-2">
                <span className="sr-only">Add files</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((spec) => {
              const files = filesOf(docs, spec.key);
              const status = statusOf(docs, spec.key);
              const expanded = open === spec.key;
              const detailId = `detail-${spec.key}`;
              return (
                <Fragment key={spec.key}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-900">{spec.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{spec.source}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={spec.requirement === 'Mandatory' ? 'amber' : 'gray'}>{spec.requirement}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone[status]}>{status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        aria-label={`${spec.name}: ${files.length} ${files.length === 1 ? 'file' : 'files'}`}
                        onClick={() => setOpen(expanded ? null : spec.key)}
                        className="num inline-flex items-center gap-1 rounded text-gray-700 hover:text-gray-900"
                      >
                        {files.length}
                        <ChevronRight className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden />
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        className="btn-ghost h-7 w-7 px-0"
                        aria-label={`Add files to ${spec.name}`}
                        title={locked ? 'Submitted: files can no longer be changed' : 'Add files'}
                        disabled={locked}
                        onClick={() => {
                          target.current = spec;
                          picker.current?.click();
                        }}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr id={detailId} className="bg-gray-50/70">
                      <td colSpan={6} className="px-4 py-3">
                        {files.length === 0 ? (
                          <p className="text-xs text-gray-500">
                            {status === 'N/A' ? 'Marked as not applicable for this DPR.' : 'No files attached yet.'}
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {files.map((f, i) => (
                              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                                <span className="min-w-0 truncate text-gray-800">
                                  {f.name} <span className="text-gray-400">· {formatSize(f.size)}</span>
                                </span>
                                {!locked && (
                                  <button type="button" aria-label={`Remove ${f.name}`} className="text-gray-400 hover:text-rose-600" onClick={() => onRemove(spec, i)}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {spec.requirement === 'Optional' && files.length === 0 && !locked && (
                          <button
                            type="button"
                            className="mt-2 text-xs font-medium text-accent-600 hover:underline"
                            onClick={() => onNotApplicable(spec, status !== 'N/A')}
                          >
                            {status === 'N/A' ? 'Mark as applicable' : 'Mark as not applicable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination alwaysShow page={current} pageCount={pageCount} total={rows.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </Card>
  );
}
