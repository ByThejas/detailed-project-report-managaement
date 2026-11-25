import type { DprDocuments } from '@/features/documents/types';
import { ALL_DOCUMENTS, PREPARATION_INPUTS, pdfOnly } from '@/features/documents/catalog';
import { statusOf } from '@/features/documents/state';
import { hasLineWorks, linesMissingRates } from '@/features/preparation/calc';
import { hasBcrInputs, isBcrExempt } from '@/features/preparation/finance';
import type { Estimate } from '@/features/preparation/types';
import { TEMPLATE_SOURCE } from '@/features/preparation/template';
import { sectionLabel } from '@/features/boq-import/toEstimateLine';
import { contentGapItems, type DprContent } from './content';
import { pertProblemItems } from './pert';
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
  /** Stable while the problem lasts, so the fix guide can tell when it is solved. */
  id: string;
  step: StepKey;
  label: string;
  /** What to do, in plain words. */
  how: string;
  /** The data-fix anchor of the field to change, on that step. */
  target?: string;
}

/** A cross-check as a gap, so its Fix button lands on the field and says what to do. */
export const gapOfCheck = (c: CrossCheck): Gap => ({ id: `check:${c.id}`, step: c.step, label: `mismatch: ${c.message}`, how: c.how, target: c.target });

/** Everything that keeps the DPR a draft, grouped by the step where it is fixed. */
export function dprChecklist(e: Estimate, docs: DprDocuments, content: DprContent, checks: CrossCheck[] = []): Gap[] {
  const gaps: Gap[] = [];
  for (const key of PREPARATION_INPUTS) {
    // Optional inputs (e.g. the TCCM proposal) don't keep the DPR a draft.
    const spec = ALL_DOCUMENTS.find((d) => d.key === key);
    if (spec?.requirement !== 'Mandatory') continue;
    if (statusOf(docs, key) === 'Awaiting') {
      gaps.push({
        id: `doc:${key}`,
        step: 'inputs',
        label: `document: ${spec.name}`,
        target: `doc:${key}`,
        how: `Press “Upload” on the ${spec.name} row and choose the file${pdfOnly(key) ? ' (PDF only)' : ''}. It is mandatory, so it cannot be marked not applicable.`,
      });
    }
  }
  const noRate = linesMissingRates(e);
  if (noRate.length) {
    const shown = noRate.slice(0, 12).map((l) => l.code || '?').join(', ') + (noRate.length > 12 ? ` and ${noRate.length - 12} more` : '');
    gaps.push({
      id: 'rates',
      step: 'estimate',
      label: `rates for ${noRate.map((l) => l.code).join(', ')}`,
      target: `line:${noRate[0]!.id}`,
      how: `${noRate.length} ${noRate.length === 1 ? 'item has' : 'items have'} a quantity but no rate (${shown}); ${noRate.length === 1 ? 'it is' : 'they are'} shaded amber. Type the supply rate (and erection / T&C rate where it applies) in ${noRate.length === 1 ? 'the highlighted row' : 'each, starting with the highlighted row'}, or use “Price from the rate catalog” above the tables.`,
    });
  }
  if (!e.lines.some((l) => l.section === 'electrical')) {
    gaps.push({ id: 'part-a', step: 'estimate', label: 'Part A items', target: 'estimate-upload', how: 'Upload the estimated BOQ workbook (.xlsx) here, check the review and press Import. Or add the Electrical BOQ (Part A) items by hand with “Add item”.' });
  }
  const sample = e.lines.filter((l) => l.source === TEMPLATE_SOURCE);
  if (sample.length) {
    const where = [...new Set(sample.map((l) => sectionLabel(l.section)))].join(', ');
    gaps.push({
      id: 'sample',
      step: 'estimate',
      label: `${sample.length} items are still the sample template's (${where}): import or replace them`,
      target: 'estimate-upload',
      how: `${sample.length} items in ${where} still carry the sample template’s quantities, not this project’s. Upload this project’s BOQ workbook here and import it with “Replace”. Or check each sample item in ${where} and correct it; an edited item counts as checked.`,
    });
  }
  const noBcr = isBcrExempt(e);
  if (!noBcr && !hasBcrInputs(e.financials)) {
    const manual = e.financials?.method === 'manual';
    gaps.push(
      manual
        ? { id: 'bcr', step: 'finance', label: 'yearly benefits for the BCR', target: 'bcr:benefits', how: 'Type the benefit for each year in Rs lakh, or paste the benefit row from the BCR sheet into the box below and press “Fill years from pasted values”.' }
        : { id: 'bcr', step: 'finance', label: 'BCR inputs (additional MVA)', target: 'bcr:addedMva', how: 'Type “Additional load after enhancement” in MVA: the net MVA this work adds to the station. If a “Use … MVA” button shows below the inputs, press it to take the DPR capacity.' },
    );
  }
  for (const p of pertProblemItems(content.pert)) gaps.push({ id: `${p.target}${p.text.startsWith('stages run') ? ':end' : ''}`, step: 'schedule', label: `PERT: ${p.text}`, target: p.target, how: p.how });
  for (const g of contentGapItems(content, hasLineWorks(e), noBcr)) gaps.push({ id: `text:${g.target}`, step: 'text', label: `text: ${g.label}`, target: g.target, how: g.how });
  for (const c of openBlockers(checks, content.acks)) gaps.push(gapOfCheck(c));
  return gaps;
}

/** The checklist as plain labels, for the DRAFT cover. */
export function dprGaps(e: Estimate, docs: DprDocuments, content: DprContent, checks: CrossCheck[] = []): string[] {
  return dprChecklist(e, docs, content, checks).map((g) => g.label);
}
