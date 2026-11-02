import type { DprRow } from '@/features/reports/types';

/** One bar on the PERT chart. Months count from the zero date (M0). */
export interface PertActivity {
  name: string;
  /** Month the activity starts, 0 = zero date. Pre-award activities may start before 0. */
  start: number;
  months: number;
  /** Detail lines shown under the stage, e.g. "Vendor drawing approval". */
  details: string[];
  /** Pre-award activities (DPR, funding, tendering) are drawn but not counted in the completion period. */
  preAward?: boolean;
}

export interface PertPlan {
  completionMonths: number;
  zeroDate: string;
  scope: string;
  activities: PertActivity[];
}

/** Stage layout of the Thyavanige PERT chart: 3 + 4 + 5 months after award. */
export function defaultPert(dpr: DprRow, lineWorks: boolean): PertPlan {
  return {
    completionMonths: 12,
    zeroDate: 'LOI / Award',
    scope: dpr.capacity ? `${dpr.capacity}${lineWorks ? ' and line works' : ''}` : '',
    activities: [
      { name: 'DPR & funding', start: -2, months: 1, details: [], preAward: true },
      { name: 'Tendering activity & awarding', start: -1, months: 1, details: [], preAward: true },
      {
        name: 'Stage-I',
        start: 0,
        months: 3,
        details: lineWorks
          ? ['Vendor drawing approval', 'Survey & profiling', 'Foundation works at tower locations']
          : ['Vendor drawing approval', 'Civil and equipment foundation works'],
      },
      {
        name: 'Stage-II',
        start: 3,
        months: 4,
        details: lineWorks
          ? ['Supply of materials', 'Erection of tower structures', 'Stringing arrangements', 'Laying of cables & accessories']
          : ['Supply of materials', 'Erection of structures', 'Laying of cables & accessories'],
      },
      {
        name: 'Stage-III',
        start: 7,
        months: 5,
        details: lineWorks
          ? ['Equipment erection', 'Conductor stringing & sagging', 'Testing & checks', 'Commissioning']
          : ['Equipment erection', 'Testing & checks', 'Commissioning'],
      },
    ],
  };
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
