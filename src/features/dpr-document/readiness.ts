import type { DprDocuments } from '@/features/documents/types';
import { ALL_DOCUMENTS, PREPARATION_INPUTS } from '@/features/documents/catalog';
import { statusOf } from '@/features/documents/state';
import { hasLineWorks, linesMissingRates } from '@/features/preparation/calc';
import { hasBcrInputs } from '@/features/preparation/finance';
import type { Estimate } from '@/features/preparation/types';
import { TEMPLATE_SOURCE } from '@/features/preparation/template';
import { sectionLabel } from '@/features/boq-import/toEstimateLine';
import { contentGaps, type DprContent } from './content';
import { pertProblems } from './pert';
import { openBlockers, type CrossCheck } from './crossChecks';

/** The steps of DPR preparation, in order. The last one generates the DPR. */
export const STEPS = [
  { key: 'inputs', label: 'Input documents' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'finance', label: 'Cost-benefit' },
  { key: 'schedule', label: 'PERT schedule' },
  { key: 'text', label: 'Report text' },
  { key: 'generate', label: 'Generate DPR' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export interface Gap {
  step: StepKey;
  label: string;
}

/** Everything that keeps the DPR a draft, grouped by the step where it is fixed. */
export function dprChecklist(e: Estimate, docs: DprDocuments, content: DprContent, checks: CrossCheck[] = []): Gap[] {
  const gaps: Gap[] = [];
  for (const key of PREPARATION_INPUTS) {
    // Optional inputs (e.g. the TCCM proposal) don't keep the DPR a draft.
    if (ALL_DOCUMENTS.find((d) => d.key === key)?.requirement !== 'Mandatory') continue;
    if (statusOf(docs, key) === 'Awaiting') gaps.push({ step: 'inputs', label: `document: ${ALL_DOCUMENTS.find((d) => d.key === key)?.name ?? key}` });
  }
  const noRate = linesMissingRates(e);
  if (noRate.length) gaps.push({ step: 'estimate', label: `rates for ${noRate.map((l) => l.code).join(', ')}` });
  if (!e.lines.some((l) => l.section === 'electrical')) gaps.push({ step: 'estimate', label: 'Part A items' });
  const sample = e.lines.filter((l) => l.source === TEMPLATE_SOURCE);
  if (sample.length) {
    const where = [...new Set(sample.map((l) => sectionLabel(l.section)))].join(', ');
    gaps.push({ step: 'estimate', label: `${sample.length} items are still the sample template's (${where}): import or replace them` });
  }
  if (!hasBcrInputs(e.financials)) gaps.push({ step: 'finance', label: e.financials?.method === 'manual' ? 'yearly benefits for the BCR' : 'BCR inputs (additional MVA)' });
  for (const p of pertProblems(content.pert)) gaps.push({ step: 'schedule', label: `PERT: ${p}` });
  for (const g of contentGaps(content, hasLineWorks(e))) gaps.push({ step: 'text', label: `text: ${g}` });
  for (const c of openBlockers(checks, content.acks)) gaps.push({ step: c.step, label: `mismatch: ${c.message}` });
  return gaps;
}

/** The checklist as plain labels, for the DRAFT cover. */
export function dprGaps(e: Estimate, docs: DprDocuments, content: DprContent, checks: CrossCheck[] = []): string[] {
  return dprChecklist(e, docs, content, checks).map((g) => g.label);
}
