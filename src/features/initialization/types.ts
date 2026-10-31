export const PROJECT_TYPES = ['Greenfield', 'Brownfield'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const VOLTAGE_CLASSES = ['66 kV', '110 kV', '220 kV', '400 kV'] as const;
export type VoltageClass = (typeof VOLTAGE_CLASSES)[number];

export interface Circle {
  id: string;
  name: string;
}

export interface Division {
  id: string;
  name: string;
  circleId: string;
}

export interface NewDprRequest {
  projectName: string;
  projectType: ProjectType;
  voltageClass: VoltageClass;
  capacity: string;
  location: string;
  circleId: string;
  divisionId: string;
}

export interface CreatedDpr extends NewDprRequest {
  id: string;
  finalApprover: string;
  voltageGroup: string;
  status: 'DATA_PENDING';
  createdAt: string;
}
