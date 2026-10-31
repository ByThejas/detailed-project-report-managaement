import { circles, divisions, zones } from '@/data/locations';
import type { Circle, Division, Zone } from './types';

const zoneById = new Map(zones.map((z) => [z.id, z]));
const circleById = new Map(circles.map((c) => [c.id, c]));
const divisionById = new Map(divisions.map((d) => [d.id, d]));

export const getZone = (id: string): Zone | undefined => zoneById.get(id);
export const getCircle = (id: string): Circle | undefined => circleById.get(id);
export const getDivision = (id: string): Division | undefined => divisionById.get(id);

export const circlesOfZone = (zoneId: string) => circles.filter((c) => c.zoneId === zoneId);
export const divisionsOfCircle = (circleId: string) => divisions.filter((d) => d.circleId === circleId);

/** Divisions under a zone and/or circle, by name. Used by the Reports filters. */
export function divisionNames(zoneName: string, circleName: string): string[] {
  const zoneId = zones.find((z) => z.name === zoneName)?.id;
  const circleId = circles.find((c) => c.name === circleName)?.id;
  return divisions
    .filter((d) => (!circleId || d.circleId === circleId) && (!zoneId || circleById.get(d.circleId)?.zoneId === zoneId))
    .map((d) => d.name);
}

export function circleNames(zoneName: string): string[] {
  const zoneId = zones.find((z) => z.name === zoneName)?.id;
  return circles.filter((c) => !zoneId || c.zoneId === zoneId).map((c) => c.name);
}

export const zoneNames = zones.map((z) => z.name);
