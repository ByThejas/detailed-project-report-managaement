import type { DprRow } from '@/features/reports/types';
import type { Estimate } from '@/features/preparation/types';

/** "Project at a glance" facts the app can't derive. Shown as a table in the DPR. */
export const DETAIL_FIELDS = [
  { key: 'nameOfWork', label: 'Name of work' },
  { key: 'location', label: 'Location' },
  { key: 'existingCapacity', label: 'Existing capacity', placeholder: 'e.g. 2×8 MVA, 66/11 kV' },
  { key: 'proposedCapacity', label: 'Proposed capacity' },
  { key: 'presentPeakLoading', label: 'Present peak loading', placeholder: 'e.g. 5.8 MW (loading factor 0.852) on TR-1' },
  { key: 'loadingAfter', label: 'Loading after the work', placeholder: 'e.g. 0.6116 and 0.45' },
  { key: 'approval', label: 'Approval', placeholder: 'e.g. 91st TCCM held on 09.02.2024' },
  { key: 'budgetProvision', label: 'Budget provision', placeholder: 'e.g. List-III, new works 2025-26, Sl. No. 62, Rs 1.00 lakh' },
  { key: 'priceBasis', label: 'Price basis' },
  { key: 'jurisdiction', label: 'Jurisdiction' },
  { key: 'preparedBy', label: 'Prepared by', placeholder: 'e.g. Superintending Engineer (Elec), Operations Zone' },
] as const;

export type DetailKey = (typeof DETAIL_FIELDS)[number]['key'];

/** The DPR's numbered sections, as in the sample report. */
export const SECTIONS = [
  { key: 'scope', no: '02', title: 'Scope of the project' },
  { key: 'existing', no: '03', title: 'Existing power supply arrangements' },
  { key: 'problems', no: '04', title: 'Problems' },
  { key: 'objectives', no: '05', title: 'Objectives' },
  { key: 'schedule', no: '06', title: 'Schedule of implementation' },
  { key: 'results', no: '07', title: 'Results to be achieved after commissioning' },
  { key: 'alternatives', no: '08', title: 'List of alternatives' },
  { key: 'costBenefit', no: '09', title: 'Cost-benefit analysis and payback period' },
  { key: 'expenditure', no: '10', title: 'Expenditure' },
  { key: 'proposals', no: '11', title: 'Proposals' },
  { key: 'approvals', no: '12', title: 'Approvals' },
  { key: 'budget', no: '13', title: 'Budget provision' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export interface DprContent {
  details: Record<DetailKey, string>;
  sections: Record<SectionKey, string>;
}

/** Text in [square brackets] is a placeholder still to be written. */
export const PLACEHOLDER = /\[[^\]]+\]/;

export function defaultContent(dpr: DprRow): DprContent {
  const brownfield = dpr.stream !== 'Greenfield';
  const where = [dpr.station || dpr.location, dpr.division && `${dpr.division} division`, dpr.circle && `${dpr.circle} circle`].filter(Boolean).join(', ');
  return {
    details: {
      nameOfWork: dpr.project,
      location: where,
      existingCapacity: brownfield ? '' : 'Not applicable (new sub-station)',
      proposedCapacity: `${dpr.capacity}, ${dpr.voltage}`,
      presentPeakLoading: '',
      loadingAfter: '',
      approval: '',
      budgetProvision: '',
      priceBasis: 'Common Schedule of Rates for KPTCL, ESCOMs & PWD (Electrical) 2023-24, Volume 6',
      jurisdiction: dpr.zone ? `${dpr.zone} zone` : '',
      preparedBy: '',
    },
    sections: {
      scope: brownfield
        ? `This project report envisages the ${dpr.project.charAt(0).toLowerCase()}${dpr.project.slice(1)} (${dpr.capacity}, ${dpr.voltage}).\n\n[Describe what is replaced or added and why.]`
        : `This project report envisages the construction of ${dpr.project} with ${dpr.capacity}, ${dpr.voltage} transformation capacity.\n\n[Describe the station, its source and the area it will serve.]`,
      existing: '[Describe how the area is fed today: source station, line and conductor, installed capacity and recorded peak loads. Add a transformer loading table if needed.]',
      problems: '[Describe the overloading, reliability or voltage problems this work solves.]',
      objectives: 'Primary\n\n[Main objective, e.g. reduce the loading of the existing transformers.]\n\nSecondary\n\n[Further benefits, e.g. redundancy, future load growth, daytime supply to IP sets.]',
      schedule: 'The activity chart (PERT chart) for the proposed work, indicating the time line for each stage of work, is placed at Annexure B.',
      results: '[Expected results, e.g. additional energy available for sale over 30 years, overloading avoided.]',
      alternatives: '[Alternatives considered and why this one was chosen.]',
      costBenefit: 'The benefit-cost ratio, internal rate of return and payback period are given below. Detailed working is placed at Annexure D.',
      expenditure: brownfield
        ? 'In general, for power transformer replacement works, the provisional expenditure is 80% of the awarded amount within a year from the date of award and the balance 20% of the awarded amount during the consequent year.'
        : '[Phasing of expenditure over the construction period.]',
      proposals: '[List the works proposed in this DPR.]',
      approvals: '[TCCM approval and ratification with dates, and where the extract of proceedings is placed (Annexure E).]',
      budget: '[Budget list, year, serial number and nominal budget.]',
    },
  };
}

export const contentOf = (dpr: DprRow, e: Estimate): DprContent => {
  const d = defaultContent(dpr);
  const saved = e.document;
  return saved ? { details: { ...d.details, ...saved.details }, sections: { ...d.sections, ...saved.sections } } : d;
};

/** What still has to be written before the DPR stops being a draft. */
export function contentGaps(c: DprContent): string[] {
  const gaps: string[] = [];
  for (const f of DETAIL_FIELDS) if (!c.details[f.key]?.trim()) gaps.push(f.label);
  for (const s of SECTIONS) if (!c.sections[s.key]?.trim() || PLACEHOLDER.test(c.sections[s.key])) gaps.push(`${s.no} ${s.title}`);
  return gaps;
}
