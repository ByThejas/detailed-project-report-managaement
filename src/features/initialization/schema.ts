import { z } from 'zod';
import { CAPACITY_MVA, CAPACITY_UNITS, PROJECT_TYPES, VOLTAGE_CLASSES, WORK_TYPES } from './types';

export const newDprSchema = z
  .object({
  projectName: z.string().trim().min(5, 'Enter the project name, e.g. 110/11kV Channapatna New S/S'),
  projectType: z.enum(PROJECT_TYPES),
  workType: z.enum(WORK_TYPES),
  voltageClass: z.enum(VOLTAGE_CLASSES),
  capacityUnits: z.union([z.enum(CAPACITY_UNITS), z.literal('')]),
  capacityMva: z.union([z.enum(CAPACITY_MVA), z.literal('')]),
  location: z.string().trim().min(2, 'Enter the location or place'),
  zoneId: z.string().min(1, 'Choose a zone'),
  circleId: z.string().min(1, 'Choose a circle'),
  divisionId: z.string().min(1, 'Choose a division'),
  stationCode: z.string(),
  })
  // Station work always has a transformer capacity. Line work may have none; if one part is given, both are needed.
  .superRefine((v, ctx) => {
    const needed = v.workType === 'Station work' || v.capacityUnits !== '' || v.capacityMva !== '';
    if (needed && !v.capacityUnits) ctx.addIssue({ code: 'custom', path: ['capacityUnits'], message: 'Choose the number of units' });
    if (needed && !v.capacityMva) ctx.addIssue({ code: 'custom', path: ['capacityMva'], message: 'Choose the MVA rating' });
  });

export type NewDprForm = z.infer<typeof newDprSchema>;
