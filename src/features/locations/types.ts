export interface Zone {
  id: string;
  name: string;
}

export interface Circle {
  id: string;
  name: string;
  zoneId: string;
}

export interface Division {
  id: string;
  name: string;
  circleId: string;
}

/** [code, name, divisionId, nodal, voltage, district, taluk] */
export type StationRecord = readonly [string, string, string, string, string, string, string];

export interface Station {
  code: string;
  name: string;
  divisionId: string;
  nodal: string;
  voltage: string;
  district: string;
  taluk: string;
}
