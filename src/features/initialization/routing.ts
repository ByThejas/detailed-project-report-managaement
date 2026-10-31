import type { VoltageClass } from './types';

export interface ApprovalRoute {
  /** Voltage group the DPR is reviewed under, e.g. "66/110 kV". */
  voltageGroup: string;
  /** Who gives final approval. `null` when the rule is not known yet. */
  finalApprover: string | null;
}

/**
 * Approval routing by voltage class.
 * 66 kV -> "66/110 kV" and "CGM (Tech) Corporate Office" is taken from the old system's screen.
 * 110 kV is assumed to follow the same group. 220 kV and 400 kV are NOT confirmed yet.
 */
const ROUTES: Record<VoltageClass, ApprovalRoute> = {
  '66 kV': { voltageGroup: '66/110 kV', finalApprover: 'CGM (Tech) Corporate Office' },
  '110 kV': { voltageGroup: '66/110 kV', finalApprover: 'CGM (Tech) Corporate Office' },
  '220 kV': { voltageGroup: '220 kV', finalApprover: null },
  '400 kV': { voltageGroup: '400 kV', finalApprover: null },
};

export function approvalRouteFor(voltage: VoltageClass): ApprovalRoute {
  return ROUTES[voltage];
}
