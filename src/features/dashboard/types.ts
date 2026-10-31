import type { BarItem } from '@/components/ui/BarList';
import type { Stage } from '@/features/reports/types';

export interface StageCount {
  stage: Stage;
  count: number;
}

export interface DivisionCompletion {
  division: string;
  total: number;
  inProgress: number;
  generated: number;
}

export interface DashboardSummary {
  counts: {
    total: number;
    /** Under validation + under approval */
    inReview: number;
    pendingDependencies: number;
    generated: number;
  };
  /** Rs. lakhs. `null` until cost estimates exist. */
  finance: {
    totalEstimated: number | null;
    sanctioned: number | null;
    workInProgress: number | null;
    balance: number | null;
  };
  stages: StageCount[];
  byVoltage: BarItem[];
  byStream: BarItem[];
  byDivision: DivisionCompletion[];
}
