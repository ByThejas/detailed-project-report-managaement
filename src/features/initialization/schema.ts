import { z } from 'zod';
import { PROJECT_TYPES, VOLTAGE_CLASSES } from './types';

/** "1x16 MVA", "2 x 12.5 MVA", "1×100 MVA" */
export const CAPACITY_PATTERN = /^\d+\s*[x×]\s*\d+(\.\d+)?\s*MVA$/i;

export const newDprSchema = z.object({
  projectName: z.string().trim().min(5, 'Enter the project name, e.g. 110/11kV Channapatna New S/S'),
  projectType: z.enum(PROJECT_TYPES),
  voltageClass: z.enum(VOLTAGE_CLASSES),
  capacity: z.string().trim().regex(CAPACITY_PATTERN, 'Use the form 1x16 MVA'),
  location: z.string().trim().min(2, 'Enter the location or place'),
  circleId: z.string().min(1, 'Choose a circle'),
  divisionId: z.string().min(1, 'Choose a division'),
});

export type NewDprForm = z.infer<typeof newDprSchema>;
