import type { ProgrammeReport } from '@/features/reports/types';

/** Report schedule from the old system. Reference data, not DPRs. */
export const programmeReportsSample: ProgrammeReport[] = [
  { key: 'dpr-status', name: 'DPR Status', frequency: 'Daily' },
  { key: 'approval-delays', name: 'Approval Delays', frequency: 'Weekly' },
  { key: 'division-progress', name: 'Division Progress', frequency: 'Monthly' },
  { key: 'financial-summary', name: 'Financial Summary', frequency: 'Monthly' },
  { key: 'pending-dpr', name: 'Pending DPR Report', frequency: 'Weekly' },
  { key: 'escalation', name: 'Escalation Report', frequency: 'Weekly' },
];
