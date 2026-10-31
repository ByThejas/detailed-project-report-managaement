import { useQuery } from '@tanstack/react-query';
import { zones } from '@/data/locations';
import { circlesOfZone, divisionsOfCircle } from './lookup';
import type { Station, StationRecord } from './types';

const toStation = ([code, name, divisionId, nodal, voltage, district, taluk]: StationRecord): Station => ({
  code,
  name,
  divisionId,
  nodal,
  voltage,
  district,
  taluk,
});

/** The location tree ships with the app (generated from the KPTCL workbook), so these never wait on a network. */
export const useZones = () => zones;
export const useCircles = (zoneId: string) => (zoneId ? circlesOfZone(zoneId) : []);
export const useDivisions = (circleId: string) => (circleId ? divisionsOfCircle(circleId) : []);

/** Stations are the large part of the data, so they load on first use as a separate chunk. */
export function useStations(divisionId: string) {
  return useQuery({
    queryKey: ['locations', 'stations', divisionId],
    enabled: Boolean(divisionId),
    staleTime: Infinity,
    queryFn: async () => {
      const { stations } = await import('@/data/stations');
      return stations.filter((s) => s[2] === divisionId).map(toStation);
    },
  });
}
