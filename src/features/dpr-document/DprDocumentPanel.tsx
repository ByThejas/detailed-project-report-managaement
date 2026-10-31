import { useState, type CSSProperties } from 'react';
import { CheckCircle2, FileText, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { DprDocuments } from '@/features/documents/types';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { useToast } from '@/lib/toast';
import { downloadDprDocx } from './buildDocx';
import { DETAIL_FIELDS, PLACEHOLDER, SECTIONS, contentOf, type DetailKey, type DprContent, type SectionKey } from './content';
import { dprGaps } from './readiness';

interface Props {
  dpr: DprRow;
  estimate: Estimate;
  documents: DprDocuments;
  onChange: (e: Estimate) => void;
}

export function DprDocumentPanel({ dpr, estimate, documents, onChange }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const content = contentOf(dpr, estimate);
  const gaps = dprGaps(estimate, documents, content);

  const save = (next: DprContent) => onChange({ ...estimate, document: next });
  const setDetail = (key: DetailKey, value: string) => save({ ...content, details: { ...content.details, [key]: value } });
  const setSection = (key: SectionKey, value: string) => save({ ...content, sections: { ...content.sections, [key]: value } });

  const download = async () => {
    setBusy(true);
    try {
      await downloadDprDocx({ dpr, estimate, documents, content, gaps });
      toast(gaps.length ? { title: 'Draft DPR downloaded', description: `${gaps.length} items still missing; the cover is marked DRAFT.`, tone: 'info' } : { title: 'DPR downloaded', description: dpr.id });
    } catch {
      toast({ title: 'Download failed', description: 'Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card role="region" aria-labelledby="dpr-doc-title">
        <CardHeader
          id="dpr-doc-title"
          title="DPR document (Word)"
          subtitle="Cover, sections 01–14, estimates and BCR annexures, laid out like the sample DPR"
          action={
            <button type="button" className="btn-primary" onClick={download} disabled={busy}>
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {busy ? 'Preparing…' : gaps.length ? 'Download draft (Word)' : 'Download Word'}
            </button>
          }
        />
        <div className="px-4 py-3 text-[13px]">
          {gaps.length ? (
            <div role="status" className="flex items-start gap-2 text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p>
                  {gaps.length} {gaps.length === 1 ? 'thing is' : 'things are'} still missing, so the Word file is marked DRAFT:
                </p>
                <ul className="mt-1 list-disc gap-x-8 space-y-0.5 pl-5 text-xs sm:columns-2 lg:columns-3">
                  {gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Everything is in place. The Word file is ready for submission.
            </p>
          )}
        </div>
      </Card>

      <Card role="region" aria-labelledby="dpr-details-title">
        <CardHeader id="dpr-details-title" title="01 Project at a glance" subtitle="Facts for the cover, section 01 and the salient features" />
        <div className="grid gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-2">
          {DETAIL_FIELDS.map((f) => (
            <label key={f.key} className="block text-[13px]">
              <span className="label-muted mb-1 block">{f.label}</span>
              <input
                className={`input ${content.details[f.key]?.trim() ? '' : 'border-amber-300'}`}
                value={content.details[f.key]}
                placeholder={'placeholder' in f ? f.placeholder : undefined}
                onChange={(ev) => setDetail(f.key, ev.target.value)}
              />
            </label>
          ))}
        </div>
      </Card>

      <Card role="region" aria-labelledby="dpr-sections-title">
        <CardHeader id="dpr-sections-title" title="Sections 02–13" subtitle="Replace every [bracketed] note with the project’s own text. Blank lines start a new paragraph." />
        <div className="divide-y divide-gray-100">
          {SECTIONS.map((s) => {
            const value = content.sections[s.key];
            const open = !value.trim() || PLACEHOLDER.test(value);
            return (
              <label key={s.key} className="block px-4 py-3 text-[13px]">
                <span className="mb-1 flex items-center gap-2">
                  <span className="num text-gray-400">{s.no}</span>
                  <span className="font-medium text-gray-900">{s.title}</span>
                  {open && <span className="text-xs text-amber-700">to write</span>}
                </span>
                <textarea
                  value={value}
                  onChange={(ev) => setSection(s.key, ev.target.value)}
                  style={{ fieldSizing: 'content' } as CSSProperties}
                  className="input min-h-[4.5rem] w-full py-1.5 leading-relaxed"
                />
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
