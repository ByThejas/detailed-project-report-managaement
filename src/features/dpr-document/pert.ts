import type { DprRow } from '@/features/reports/types';

/** One bar on the PERT chart. Months count from the zero date (M0). */
export interface PertActivity {
  /** "Stage-I", "DPR & funding". */
  name: string;
  /** What the stage covers, as on the KPTCL PERT chart: "Vendor approval, land levelling, foundation works". */
  label?: string;
  /** Month the activity starts, 0 = zero date. Pre-award activities may start before 0. */
  start: number;
  months: number;
  /** Detail lines shown under the stage, e.g. "Vendor drawing approval". */
  details: string[];
  /** Milestone reached at the end of the stage, e.g. "Foundation ready". */
  milestone?: string;
  /** Pre-award activities (DPR, funding, tendering) are drawn but not counted in the completion period. */
  preAward?: boolean;
}

export type PertKind = 'Sub-station work' | 'Transmission line work';

export interface PertPlan {
  completionMonths: number;
  zeroDate: string;
  scope: string;
  activities: PertActivity[];
  kind?: PertKind;
  /** Basis of the completion period, e.g. "Augmentation — 6 months from the date of LOI / Award, or …". */
  caseText?: string;
  /** Note printed under the chart. */
  note?: string;
  /** Marks the chart "Provisional schedule". */
  provisional?: boolean;
}

interface Stage {
  label: string;
  months: number;
  milestone: string;
  details: string[];
}

/** A standard schedule from the KPTCL PERT chart generator (12-09-2026), by the project it was drawn for. */
export interface PertPreset {
  label: string;
  kind: PertKind;
  caseText: string;
  note: string;
  provisional: boolean;
  stages: Stage[];
}

const SS_STAGE_I = { label: 'Vendor approval, land levelling, foundation works', milestone: 'Foundation ready', details: ['Vendor drawing approval', 'Site levelling', 'Transformer plinth & foundation'] };
const SS_STAGE_II = { label: 'Supply of equipments, erection of mounting structure, laying of cables', milestone: 'Supplies & structures complete', details: ['Delivery of power transformer', 'Supply of switchgear & equipment', 'Erection of mounting structures', 'Laying of power & control cables'] };
const SS_STAGE_III = { label: 'Erection of equipments, wiring, testing & commissioning', milestone: 'Transformer charged', details: ['Equipment erection', 'Control & protection wiring', 'Pre-commissioning tests', 'Charging'] };
const LINE_STAGES = (conductor: string): Stage[] => [
  { label: 'Vendor drawing approval, foundation works at tower locations', months: 4, milestone: 'Foundations ready', details: ['Vendor drawing approval', 'Survey & profiling', 'Foundation works at tower locations'] },
  { label: 'Supply of materials, erection of tower structures, laying of cables etc.', months: 4, milestone: 'Supplies & erection complete', details: [`Supply of ${conductor} & hardware`, 'Erection / strengthening of tower structures', 'Stringing arrangements', 'Laying of cables & accessories'] },
  { label: 'Equipment erection, commissioning', months: 4, milestone: 'Line commissioned', details: ['Line equipment erection', 'Conductor stringing & sagging', 'Testing & checks', 'Commissioning of line'] },
];
const AUGMENTATION = (months: number) => `Augmentation — ${months} months from the date of LOI / Award, or one month from the date of supply of the transformer, whichever is later.`;

export const PERT_PRESETS: PertPreset[] = [
  { label: 'Kampli — 1×20 MVA (augmentation, 6 months)', kind: 'Sub-station work', caseText: AUGMENTATION(6), provisional: false,
    note: 'Transformer supply is the governing input for Stage-II; the schedule shifts correspondingly if supply is delayed beyond the award-linked period.',
    stages: [{ ...SS_STAGE_I, months: 1 }, { ...SS_STAGE_II, months: 4 }, { ...SS_STAGE_III, months: 1 }] },
  { label: 'Kunuru — 1×12.5 MVA (additional, 6 months)', kind: 'Sub-station work', caseText: AUGMENTATION(6), provisional: false,
    note: 'Additional transformer bay is taken up within the existing yard; no additional land acquisition is involved.',
    stages: [{ ...SS_STAGE_I, months: 1 }, { ...SS_STAGE_II, months: 4 }, { ...SS_STAGE_III, months: 1 }] },
  { label: 'Munirabad — 2×20 MVA (augmentation with earthmat, 6 months)', kind: 'Sub-station work', provisional: false,
    caseText: 'Augmentation — 6 months from the date of LOI / Award, OR one month from the date of supply of the transformer, OR 15 days from the date of issue of the last LC, whichever is later.',
    note: 'Earthmat formation is proposed for the entire yard area; hence 6 months is proposed for completion of the augmentation work.',
    stages: [
      { label: 'Vendor approval, land levelling / earth excavation, foundation works', months: 1, milestone: 'Foundations ready', details: ['Vendor drawing approval', 'Earth excavation & levelling', 'Foundation works'] },
      { label: 'Supply of earthmat materials & equipments, laying of earthmat, erection of structures, cables', months: 3, milestone: 'Earthmat & erection complete', details: ['Supply of earthmat materials', 'Laying of earthmat — entire yard', 'Delivery of transformers & equipment', 'Erection of structures, laying of cables'] },
      { ...SS_STAGE_III, months: 2, milestone: 'Both units charged', details: ['Equipment erection', 'Control & protection wiring', 'Pre-commissioning tests', 'Charging of both units'] },
    ] },
  { label: 'Pillagumpa — 2×31.5 MVA (augmentation, 5 months)', kind: 'Sub-station work', caseText: AUGMENTATION(5), provisional: false,
    note: 'Both units are augmented within the same outage window; existing foundations are reused wherever the new footprint permits.',
    stages: [{ ...SS_STAGE_I, months: 1, milestone: 'Foundations ready' }, { ...SS_STAGE_II, months: 3, details: ['Delivery of transformers', 'Supply of equipment', 'Erection of mounting structures', 'Laying of cables'] }, { ...SS_STAGE_III, months: 1, milestone: 'Both units charged' }] },
  { label: 'Channapatna — 1×100 MVA, 220 kV (18 months)', kind: 'Sub-station work', provisional: false,
    caseText: 'Augmentation — 18 months from the date of LOI / Award, or one month from the date of supply of the transformer, whichever is later.',
    note: '220 kV class works carry an 18-month completion period reckoned from the zero date.',
    stages: [
      { ...SS_STAGE_I, months: 4, milestone: 'Foundations ready', details: ['Vendor drawing approval', 'Site levelling', 'Transformer & structure foundations', 'Cable trenches'] },
      { ...SS_STAGE_II, months: 10, details: ['Manufacture & delivery of 100 MVA transformer', 'Supply of 220 kV switchgear', 'Erection of mounting structures', 'Laying of power & control cables'] },
      { ...SS_STAGE_III, months: 4 },
    ] },
  { label: 'Kanakapura — 2×150 MVA, 220 kV (18 months, provisional)', kind: 'Sub-station work', provisional: true,
    caseText: '220 kV and above — 18 months from the date of LOI / Award.',
    note: 'Provisional schedule. For 220 kV and above works, DPR, funding and tendering activities are carried within the 18-month period and are shown inside Stage-I.',
    stages: [
      { label: 'Vendor drawing approval, foundation works, earthmat', months: 5, milestone: 'Foundation & earthmat ready', details: ['Vendor drawing approval', 'Foundation works', 'Earthmat laying'] },
      { label: 'Supply of materials, erection of mounting structures, cables etc.', months: 7, milestone: 'Supplies & erection complete', details: ['Manufacture & delivery of 150 MVA units', 'Supply of associated equipment', 'Erection of mounting structures', 'Cabling works'] },
      { label: 'Equipment erection, commissioning', months: 6, milestone: 'Both units commissioned', details: ['Equipment erection', 'Wiring & interlocks', 'Testing', 'Commissioning of both units'] },
    ] },
  { label: 'Mittemari–Bagepalli — 66 kV line, HTLS (12 months)', kind: 'Transmission line work', caseText: '66 kV — 12 months from the date of LOI / Award.', provisional: true,
    note: 'Existing D/C towers are retained; re-conductoring is carried out under planned shutdowns coordinated with the Operations Division.',
    stages: LINE_STAGES('HTLS conductor') },
  { label: 'Peresandra–Somenahalli — 66 kV line, HPC (12 months)', kind: 'Transmission line work', caseText: '66 kV — 12 months from the date of LOI / Award.', provisional: true,
    note: 'Mixed D/C and S/C tower stretch; re-conductoring is on the existing alignment with no fresh right-of-way.',
    stages: LINE_STAGES('HPC conductor') },
];

const PRE_AWARD: PertActivity[] = [
  { name: 'DPR & funding', start: -2, months: 1, details: [], preAward: true },
  { name: 'Tendering activity & awarding', start: -1, months: 1, details: [], preAward: true },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const stageName = (i: number) => `Stage-${ROMAN[i] ?? i + 1}`;

/** A plan from a preset's stages, laid end to end from M0. Pre-award rows are kept unless the preset carries them inside Stage-I. */
export function planFromPreset(preset: PertPreset, scope: string, zeroDate = 'LOI / Award'): PertPlan {
  let start = 0;
  const stages = preset.stages.map((s, i) => {
    const a: PertActivity = { name: stageName(i), label: s.label, start, months: s.months, details: [...s.details], milestone: s.milestone };
    start += s.months;
    return a;
  });
  const inside = /shown inside Stage-I/i.test(preset.note);
  return { completionMonths: start, zeroDate, scope, kind: preset.kind, caseText: preset.caseText, note: preset.note, provisional: preset.provisional, activities: [...(inside ? [] : PRE_AWARD), ...stages] };
}

const kvOf = (voltage: string) => Number(/(\d+(?:\.\d+)?)\s*kV/i.exec(voltage)?.[1] ?? 0);

/**
 * The standard schedule for the DPR, following the KPTCL PERT chart generator: 220 kV and above 18 months,
 * line works 12 months (4 + 4 + 4), augmentation of an existing station 6 months (1 + 4 + 1). A new
 * sub-station keeps the Thyavanige layout, 12 months (3 + 4 + 5).
 */
export function defaultPert(dpr: DprRow, lineWorks: boolean, lineOnly = false): PertPlan {
  const kv = kvOf(dpr.voltage);
  const scope = dpr.capacity ? `${dpr.capacity}${lineWorks && !lineOnly ? ' and line works' : ''}` : '';
  if (lineOnly) return { ...planFromPreset(PERT_PRESETS[6]!, scope), caseText: `${kv ? `${kv} kV` : 'Line works'} — 12 months from the date of LOI / Award.`, note: '', provisional: false };
  if (kv >= 220) return { ...planFromPreset(PERT_PRESETS[4]!, scope), note: PERT_PRESETS[4]!.note };
  if (dpr.stream === 'Brownfield' && !lineWorks) return { ...planFromPreset(PERT_PRESETS[0]!, scope), note: '' };
  return {
    completionMonths: 12,
    zeroDate: 'LOI / Award',
    scope,
    kind: 'Sub-station work',
    caseText: `New sub-station${lineWorks ? ' with line works' : ''} — 12 months from the date of LOI / Award.`,
    note: '',
    provisional: false,
    activities: [
      ...PRE_AWARD,
      {
        name: 'Stage-I',
        label: lineWorks ? 'Vendor approval, survey, foundation works' : 'Vendor approval, land levelling, foundation works',
        start: 0,
        months: 3,
        milestone: 'Foundations ready',
        details: lineWorks
          ? ['Vendor drawing approval', 'Survey & profiling', 'Foundation works at tower locations']
          : ['Vendor drawing approval', 'Civil and equipment foundation works'],
      },
      {
        name: 'Stage-II',
        label: lineWorks ? 'Supply of materials, erection of structures and towers, laying of cables' : 'Supply of equipments, erection of mounting structure, laying of cables',
        start: 3,
        months: 4,
        milestone: 'Supplies & structures complete',
        details: lineWorks
          ? ['Supply of materials', 'Erection of tower structures', 'Stringing arrangements', 'Laying of cables & accessories']
          : ['Supply of materials', 'Erection of structures', 'Laying of cables & accessories'],
      },
      {
        name: 'Stage-III',
        label: 'Erection of equipments, wiring, testing & commissioning',
        start: 7,
        months: 5,
        milestone: 'Charged & commissioned',
        details: lineWorks
          ? ['Equipment erection', 'Conductor stringing & sagging', 'Testing & checks', 'Commissioning']
          : ['Equipment erection', 'Testing & checks', 'Commissioning'],
      },
    ],
  };
}

/** "Stage-I → Stage-II → Stage-III — sequential, zero float across 6 months." */
export function criticalPath(p: PertPlan): string {
  const work = p.activities.filter((a) => !a.preAward);
  return `${work.map((a) => a.name).join(' → ')} — sequential, zero float across ${p.completionMonths} months.`;
}

/** Milestones on the chart: the zero date, then each stage's milestone at its end month. */
export function pertMilestones(p: PertPlan): { month: number; label: string }[] {
  return [{ month: 0, label: `${p.zeroDate} — zero date` }, ...p.activities.filter((a) => !a.preAward && a.milestone?.trim()).map((a) => ({ month: a.start + a.months, label: a.milestone!.trim() }))];
}

/** Problems that make the chart wrong: stages past the completion period, or nothing scheduled. */
export function pertProblems(p: PertPlan): string[] {
  const out: string[] = [];
  const work = p.activities.filter((a) => !a.preAward);
  if (!work.length) out.push('no stages after award');
  if (!(p.completionMonths > 0)) out.push('completion period');
  const end = Math.max(0, ...work.map((a) => a.start + a.months));
  if (end > p.completionMonths) out.push(`stages run to M${end}, past the ${p.completionMonths}-month completion period`);
  for (const a of p.activities) if (!a.name.trim() || !(a.months > 0)) out.push(`activity "${a.name || 'unnamed'}" needs a name and a duration`);
  return out;
}

/** Month columns for the chart, from the earliest pre-award month to the completion month. */
export function pertMonths(p: PertPlan): number[] {
  const first = Math.min(0, ...p.activities.map((a) => a.start));
  const last = Math.max(p.completionMonths, ...p.activities.map((a) => a.start + a.months));
  return Array.from({ length: last - first }, (_, i) => first + i);
}
