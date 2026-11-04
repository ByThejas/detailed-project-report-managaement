import type { DprRow } from '@/features/reports/types';
import type { Estimate } from '@/features/preparation/types';
import { hasLineWorks } from '@/features/preparation/calc';
import { defaultPert, type PertPlan } from './pert';
import type { Acknowledgement } from './crossChecks';

/**
 * The DPR's text and facts, laid out like the finished Thyavanige DPR: a cover, "01 Project at a glance",
 * "02 Project report" with lettered parts a to n, then the estimates and annexures 3 to 9.
 */

interface DetailField {
  key: string;
  label: string;
  placeholder?: string;
  /** Where the field is used, for grouping on screen. */
  group: 'glance' | 'cover' | 'abstract';
  /** Only needed when the estimate has line works (e.g. a LILO line). */
  lineOnly?: boolean;
  /** May stay empty without keeping the DPR a draft. */
  optional?: boolean;
  multiline?: boolean;
}

/** Facts the app can't derive. The glance rows appear in this order in section 01. */
export const DETAIL_FIELDS = [
  { key: 'nameOfWork', label: 'Name of work', group: 'glance', multiline: true },
  { key: 'location', label: 'Location', group: 'glance', placeholder: 'e.g. 66/11 kV Thyavanige Substation, Channagiri Taluk, Davanagere District; Operations Division, Benkikere' },
  { key: 'existingCapacity', label: 'Existing capacity', group: 'glance', placeholder: 'e.g. 1×12.5 MVA, 66/11 kV — recorded peak load 10.6 MW, loading factor 0.99 (overloaded)' },
  { key: 'mvaAdded', label: 'MVA added', group: 'glance', placeholder: 'e.g. 20 MVA (1×20 MVA, 66/11 kV).' },
  { key: 'lineComponent', label: 'Line component', group: 'glance', lineOnly: true, placeholder: 'e.g. 66 kV LILO on the existing 66 kV Kukkawada–Basavapatna DC line (Coyote)' },
  { key: 'terminalBays', label: 'Terminal bays', group: 'glance', lineOnly: true, placeholder: 'e.g. 66 kV line terminal bays — 2 nos. (per TCCM)' },
  { key: 'existingSource', label: 'Existing source', group: 'glance', placeholder: 'e.g. 220/66 kV SRS Davanagere — 3×100 MVA, recorded peak loads 77, 87 and 77.9 MW' },
  { key: 'approval', label: 'Approval', group: 'glance', placeholder: 'e.g. 6th TCCM of BESCOM (Brown Field) held on 24.09.2026, Subject-63.' },
  { key: 'budgetProvision', label: 'Budget provision', group: 'glance', placeholder: 'e.g. Included in List – III, FY 2026-27 APW Code: BB1189.' },
  { key: 'apwCode', label: 'APW code', group: 'cover', placeholder: 'e.g. BB1189' },
  { key: 'financialYear', label: 'Financial year', group: 'cover', placeholder: 'e.g. FY 2026-27' },
  { key: 'jurisdiction', label: 'Jurisdiction', group: 'cover', placeholder: 'e.g. Tumakuru Operation Zone' },
  { key: 'projectNature', label: 'Project nature', group: 'cover', placeholder: 'e.g. Brown Field — Additional Transformer + LILO' },
  { key: 'coverSubtitle', label: 'Taluk and district (cover)', group: 'cover', placeholder: 'e.g. Channagiri Taluk, Davanagere District.' },
  { key: 'runningTitle', label: 'Running title (page footer)', group: 'cover', placeholder: 'e.g. 66/11 kV Thyavanige station — additional 1×20 MVA transformer and LILO arrangement' },
  { key: 'preparedBy', label: 'Prepared by', group: 'cover', placeholder: 'e.g. Prasanna Technologies Pvt. Ltd.' },
  { key: 'preparedByRole', label: 'Prepared by (role)', group: 'cover', optional: true, placeholder: 'e.g. DPR Consultant' },
  { key: 'reportMonth', label: 'Month of report', group: 'cover', placeholder: 'e.g. October 2026' },
  { key: 'substationEstimateTitle', label: 'Substation estimate title', group: 'abstract', multiline: true },
  { key: 'lineEstimateTitle', label: 'Line estimate title', group: 'abstract', lineOnly: true, multiline: true, placeholder: 'e.g. Construction of 66 kV LILO line from … for a distance of about 0.115 km with Coyote ACSR' },
  { key: 'dismantlingTitle', label: 'Dismantling (revenue works) title', group: 'abstract', optional: true },
  { key: 'certificate', label: 'Certificate on the general abstract', group: 'abstract', multiline: true },
  { key: 'signatory', label: 'Signed by', group: 'abstract', multiline: true, placeholder: 'e.g. Superintending Engineer Elecl(O), Transmission (Operations) Zone, KPTCL Tumakur.' },
] as const satisfies readonly DetailField[];

export type DetailKey = (typeof DETAIL_FIELDS)[number]['key'];
export const fieldOf = (key: DetailKey): DetailField => DETAIL_FIELDS.find((f) => f.key === key)!;

/** Parts of "02 Project report". Letters are given in order, skipping parts that don't apply. */
export const SECTIONS = [
  { key: 'scope', title: 'Scope of the project' },
  { key: 'existing', title: 'Existing power supply arrangements', table: true },
  { key: 'problems', title: 'Problems' },
  { key: 'objectivesPrimary', title: 'Primary objectives', group: 'Objectives', sub: 'i) Primary' },
  { key: 'objectivesSecondary', title: 'Secondary objectives', group: 'Objectives', sub: 'ii) Secondary' },
  { key: 'schedule', title: 'Schedule of implementation' },
  { key: 'results', title: 'Results to be achieved after commissioning' },
  { key: 'alternatives', title: 'List of alternatives' },
  { key: 'proposals', title: 'Proposals' },
  { key: 'towers', title: 'Tower schedule', lineOnly: true, table: true },
  // Left out for pure line works, which carry no BCR (ADR-0007).
  { key: 'costBenefit', title: 'Cost–benefit analysis and payback period', bcr: true },
  { key: 'expenditure', title: 'Expenditure' },
  { key: 'approvals', title: 'Approvals' },
  { key: 'budget', title: 'Budget provision' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];
type SectionSpec = (typeof SECTIONS)[number];

/** A small table inside a section, e.g. the substations on a line or the tower types. */
export interface SimpleTable {
  title: string;
  columns: string[];
  rows: string[][];
}

export type TableKey = 'existing' | 'towers';

export interface SalientRow {
  label: string;
  value: string;
}

export interface DprContent {
  details: Record<DetailKey, string>;
  sections: Record<SectionKey, string>;
  tables: Record<TableKey, SimpleTable>;
  /** "n. Salient features": label and text rows. */
  salient: SalientRow[];
  pert: PertPlan;
  /** Cross-check blockers the user accepted, with a note why. */
  acks?: Record<string, Acknowledgement>;
}

/** Text in [square brackets] is a placeholder still to be written. */
export const PLACEHOLDER = /\[[^\]]+\]/;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** 55/35/10 only when a 220 kV or higher line or bay is in scope (ADR-0018); otherwise 80/20. */
export function expenditureText(dpr: DprRow, lineWorks: boolean): string {
  const hv = Number(/(\d+)/.exec(dpr.voltage)?.[1] ?? 0);
  return lineWorks && hv >= 220
    ? 'The provisional expenditure is 55% of the awarded amount within a year from the date of award, 35% during the subsequent year, and the balance 10% during the next consequent year.'
    : 'The provisional expenditure is 80% of the awarded amount within a year from the date of award, and the balance 20% of the awarded amount during the consequent year.';
}

export function defaultContent(dpr: DprRow, lineWorks = false, lineOnly = false): DprContent {
  const brownfield = dpr.stream !== 'Greenfield';
  const where = [dpr.station || dpr.location, dpr.division && `${dpr.division} division`, dpr.circle && `${dpr.circle} circle`].filter(Boolean).join(', ');
  return {
    details: {
      nameOfWork: dpr.project,
      location: where,
      existingCapacity: brownfield ? '' : 'Not applicable (new sub-station)',
      mvaAdded: dpr.capacity ? `${dpr.capacity}, ${dpr.voltage}` : '',
      lineComponent: '',
      terminalBays: '',
      existingSource: '',
      approval: '',
      budgetProvision: '',
      apwCode: '',
      financialYear: '',
      jurisdiction: dpr.zone ? `${dpr.zone} Zone` : '',
      projectNature: brownfield ? 'Brown Field' : 'Green Field',
      coverSubtitle: '',
      runningTitle: dpr.project,
      preparedBy: '',
      preparedByRole: 'DPR Consultant',
      reportMonth: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      substationEstimateTitle: `Estimate for ${lower(dpr.project)}`,
      lineEstimateTitle: '',
      dismantlingTitle: 'Decommissioning / dismantling of existing assets',
      certificate: 'Certified that the project estimate has been prepared by my gazetted Assistant based on the estimate sent by [EEE, Operation division] for the most economical way of execution of the work.',
      signatory: '',
    },
    sections: {
      scope: brownfield
        ? `This project report envisages ${lower(dpr.project)} (${dpr.capacity}, ${dpr.voltage}).\n\n[Describe what is added or replaced, the line and bay works, and where.]`
        : `This project report envisages the construction of ${dpr.project} with ${dpr.capacity}, ${dpr.voltage} transformation capacity.\n\n[Describe the station, its source and the area it will serve.]`,
      existing: '1. [Describe how the station is fed today: source station, line and conductor, installed capacity and recorded peak loads.]',
      problems: '1. [Describe the overloading, reliability or voltage problem this work solves.]',
      objectivesPrimary: '1. [Main objective, e.g. to reduce the load on the existing power transformer.]',
      objectivesSecondary: '1. [Further benefits, e.g. system stability, future loads with additional feeders.]',
      schedule: 'Provisional PERT chart enclosed.',
      results: '1. [Expected results, e.g. improved reliability of power supply, reduction of system losses.]',
      alternatives: '[Alternatives considered and why this one was chosen.]',
      proposals: '1. [List each work proposed in this DPR.]',
      towers: lineWorks ? 'As per the Estimate, [n] new towers are proposed for the line.' : '',
      costBenefit: 'The BCR, IRR and payback period for the work are as below.',
      expenditure: expenditureText(dpr, lineWorks),
      approvals: 'The subject work was approved in the [nth TCCM of …] held on [date], Subject No-[n].',
      budget: 'The subject work is included in [List III of FY …], APW code: [code].',
    },
    tables: {
      existing: { title: 'Substations connected to the line', columns: ['Sl. no.', 'Station', 'Installed capacity', 'Peak load'], rows: [] },
      towers: { title: 'Proposed towers', columns: ['Sl. no.', 'Type of tower', 'Total'], rows: lineWorks ? [['1', '', '']] : [] },
    },
    salient: [
      { label: 'Layout/BOM', value: 'The Bill of Material for the work was issued vide letter No. [ref], dated [date], of the Chief Engineer (Elec.), Planning & Co-ordination, KPTCL.' },
      { label: 'Earthing materials', value: 'Earthmat is provided as per the SEE (R&D) design, Drg. No. [ref], dated [date].' },
      { label: 'Transformer and switchgear', value: '[Transformer rating, OLTC, 11 kV switchgear and panels.]' },
      { label: 'SCADA and control', value: 'Provision is made for SCADA communication equipment (RTU, DCU, MFTs, UPS).' },
      { label: 'Civil works', value: 'Provision for necessary civil work is included in the estimate as per site conditions.' },
      ...(brownfield ? [{ label: 'Dismantling', value: '[Existing equipment, structures or buildings to be dismantled or shifted.]' }] : []),
      { label: 'Certificate', value: 'The DPR is prepared as per the Common Schedule of Rates for KPTCL, ESCOMs & PWD (Electrical) 2023-24, Volume-6.' },
    ],
    pert: defaultPert(dpr, lineWorks, lineOnly),
  };
}

/** Line works with no sub-station items: the PERT follows the line-work schedule. */
export const isLineOnly = (e: Estimate) => hasLineWorks(e) && !e.lines.some((l) => l.section === 'electrical' || l.section === 'civil');

/** Saved text over the defaults. Older saves had one "objectives" text; it becomes the primary objectives. */
export const contentOf = (dpr: DprRow, e: Estimate): DprContent => {
  const d = defaultContent(dpr, hasLineWorks(e), isLineOnly(e));
  const saved = e.document as (Partial<DprContent> & { sections?: Partial<Record<SectionKey | 'objectives', string>> }) | undefined;
  if (!saved) return d;
  const sections = { ...d.sections, ...saved.sections } as DprContent['sections'] & { objectives?: string };
  if (sections.objectives && !saved.sections?.objectivesPrimary) sections.objectivesPrimary = sections.objectives;
  delete sections.objectives;
  return {
    details: { ...d.details, ...saved.details },
    sections,
    tables: { ...d.tables, ...saved.tables },
    salient: saved.salient ?? d.salient,
    pert: saved.pert ?? d.pert,
    acks: saved.acks ?? {},
  };
};

/** Whether a field or part belongs in this DPR. */
export const applies = (x: object, lineWorks: boolean) => !('lineOnly' in x && x.lineOnly) || lineWorks;

/** The parts of "02 Project report" this DPR has, lettered a, b, c… The two objectives share one letter. */
export function letteredSections(lineWorks: boolean, noBcr = false): { letter: string; group: string; parts: SectionSpec[] }[] {
  const out: { letter: string; group: string; parts: SectionSpec[] }[] = [];
  for (const s of SECTIONS) {
    if (!applies(s, lineWorks) || (noBcr && 'bcr' in s)) continue;
    const group = 'group' in s ? s.group : s.title;
    const last = out[out.length - 1];
    if (last && last.group === group) last.parts.push(s);
    else out.push({ letter: String.fromCharCode(97 + out.length), group, parts: [s] });
  }
  return out;
}

/** What still has to be written before the DPR stops being a draft. */
export function contentGaps(c: DprContent, lineWorks = false, noBcr = false): string[] {
  const gaps: string[] = [];
  for (const f of DETAIL_FIELDS as readonly DetailField[]) {
    if (!applies(f, lineWorks) || f.optional) continue;
    const v = c.details[f.key as DetailKey]?.trim();
    if (!v || PLACEHOLDER.test(v)) gaps.push(f.label);
  }
  for (const { letter, parts } of letteredSections(lineWorks, noBcr)) {
    for (const s of parts) {
      const v = c.sections[s.key]?.trim();
      if (!v || PLACEHOLDER.test(v)) gaps.push(`${letter}. ${s.title}`);
    }
  }
  if (lineWorks && !c.tables.towers.rows.some((r) => r.slice(1).some((x) => x.trim()))) gaps.push('Tower schedule table');
  for (const r of c.salient) if (!r.value.trim() || PLACEHOLDER.test(r.value)) gaps.push(`Salient features: ${r.label}`);
  return gaps;
}

/**
 * Physical scale of a line work, shown in place of BCR, IRR and payback when the DPR carries no BCR
 * (ADR-0007): route length from the line's title or name of work, towers from the tower schedule, and
 * terminal bays from section 01. A value not found is shown as "—".
 */
export function lineScale(c: DprContent): { route: string; towers: string; bays: string } {
  const D = c.details;
  const km = [D.lineEstimateTitle, D.lineComponent, D.nameOfWork].map((t) => t?.match(/(\d+(?:\.\d+)?)\s*(?:kms?|kilomet)/i)).find(Boolean);
  const counts = c.tables.towers.rows.map((r) => parseFloat((r[r.length - 1] ?? '').replace(/,/g, ''))).filter((n) => Number.isFinite(n));
  const towers = counts.reduce((a, n) => a + n, 0);
  const bays = D.terminalBays?.match(/(\d+)\s*(?:nos?\b|numbers)/i) ?? D.terminalBays?.match(/^\s*(\d+)\b/);
  return {
    route: km ? `${km[1]} km` : '—',
    towers: counts.length ? `${towers} nos.` : '—',
    bays: bays ? `${bays[1]} nos.` : '—',
  };
}
