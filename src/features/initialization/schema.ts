import { z } from 'zod';
import { CAPACITY_MVA, CAPACITY_UNITS, PROJECT_TYPES, VOLTAGE_CLASSES } from './types';

export const newDprSchema = z.object({
  projectName: z.string().trim().min(5, 'Enter the project name, e.g. 110/11kV Channapatna New S/S'),
  projectType: z.enum(PROJECT_TYPES),
  voltageClass: z.enum(VOLTAGE_CLASSES),
  capacityUnits: z.enum(CAPACITY_UNITS, { errorMap: () => ({ message: 'Choose the number of units' }) }),
  capacityMva: z.enum(CAPACITY_MVA, { errorMap: () => ({ message: 'Choose the MVA rating' }) }),
  location: z.string().trim().min(2, 'Enter the location or place'),
  zoneId: z.string().min(1, 'Choose a zone'),
  circleId: z.string().min(1, 'Choose a circle'),
  divisionId: z.string().min(1, 'Choose a division'),
  stationCode: z.string(),
});

export type NewDprForm = z.infer<typeof newDprSchema>;
