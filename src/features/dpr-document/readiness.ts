import type { DprDocuments } from '@/features/documents/types';
import { ALL_DOCUMENTS, PREPARATION_INPUTS } from '@/features/documents/catalog';
import { statusOf } from '@/features/documents/state';
import { linesMissingRates } from '@/features/preparation/calc';
import type { Estimate } from '@/features/preparation/types';
import { contentGaps, type DprContent } from './content';

/** Everything that keeps the DPR a draft, in the order a reviewer would fix it. */
export function dprGaps(e: Estimate, docs: DprDocuments, content: DprContent): string[] {
  const gaps: string[] = [];
  for (const key of PREPARATION_INPUTS) {
    if (statusOf(docs, key) === 'Awaiting') gaps.push(`document: ${ALL_DOCUMENTS.find((d) => d.key === key)?.name ?? key}`);
  }
  const noRate = linesMissingRates(e);
  if (noRate.length) gaps.push(`rates for ${noRate.map((l) => l.code).join(', ')}`);
  if (!e.lines.some((l) => l.section === 'electrical')) gaps.push('Part A items');
  if (!e.financials?.benefits.some((b) => b > 0)) gaps.push('yearly benefits for the BCR');
  return [...gaps, ...contentGaps(content).map((g) => `text: ${g}`)];
}
