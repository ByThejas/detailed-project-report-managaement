export type Stream = 'Greenfield' | 'Brownfield';

export const STAGES = [
  'Draft',
  'Data Pending',
  'Under Validation',
  'Under Approval',
  'Pending Dependencies',
  'Generated',
] as const;
export type Stage = (typeof STAGES)[number];

export interface DprRow {
  id: string;
  project: string;
  location: string;
  stream: Stream;
  /** Station work or line work. Older DPRs have none and count as station work. */
  workType?: 'Station work' | 'Line work';
  voltage: string;
  capacity: string;
  zone: string;
  circle: string;
  division: string;
  /** Existing station, or empty for a new site. */
  station: string;
  stage: Stage;
  /** 0–100 */
  progress: number;
  /** ISO date-time */
  createdAt: string;
}

export type Frequency = 'Daily' | 'Weekly' | 'Monthly';

export interface ProgrammeReport {
  key: string;
  name: string;
  frequency: Frequency;
}
