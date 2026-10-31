export const PROJECT_TYPES = ['Greenfield', 'Brownfield'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const VOLTAGE_CLASSES = ['66 kV', '110 kV', '220 kV', '400 kV'] as const;
export type VoltageClass = (typeof VOLTAGE_CLASSES)[number];

/** Transformer count and rating, chosen from lists so nobody types them. */
export const CAPACITY_UNITS = ['1', '2', '3', '4'] as const;
export const CAPACITY_MVA = ['5', '8', '10', '12.5', '16', '20', '31.5', '50', '63', '100', '160', '315', '500'] as const;

export const formatCapacity = (units: string, mva: string) => `${units}x${mva} MVA`;

export interface NewDprRequest {
  projectName: string;
  projectType: ProjectType;
  voltageClass: VoltageClass;
  capacity: string;
  location: string;
  zoneId: string;
  circleId: string;
  divisionId: string;
  /** Existing station the DPR is about; empty for a new site. */
  stationCode: string;
}

export interface CreatedDpr extends NewDprRequest {
  id: string;
  finalApprover: string;
  voltageGroup: string;
  status: 'DATA_PENDING';
  createdAt: string;
}
