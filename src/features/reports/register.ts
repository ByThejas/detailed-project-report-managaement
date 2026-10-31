import type { ExcelColumn } from '@/lib/exportExcel';
import type { DprRow, Stage, Stream } from './types';

export interface RegisterFilters {
  q: string;
  stream: Stream | '';
  stage: Stage | '';
  zone: string;
  circle: string;
  division: string;
}

export const NO_FILTERS: RegisterFilters = { q: '', stream: '', stage: '', zone: '', circle: '', division: '' };

/** Columns of the downloaded Excel report, in order. */
export const excelColumns: ExcelColumn<DprRow>[] = [
  { header: 'DPR ID', width: 20, value: (r) => r.id },
  { header: 'Project', width: 60, value: (r) => r.project },
  { header: 'Location', width: 28, value: (r) => r.location },
  { header: 'Project type', width: 13, value: (r) => r.stream },
  { header: 'Voltage', width: 10, value: (r) => r.voltage },
  { header: 'Capacity', width: 14, value: (r) => r.capacity },
  { header: 'Zone', width: 16, value: (r) => r.zone },
  { header: 'Circle', width: 20, value: (r) => r.circle },
  { header: 'Division', width: 20, value: (r) => r.division },
  { header: 'Station', width: 28, value: (r) => r.station },
  { header: 'Stage', width: 20, value: (r) => r.stage },
  { header: 'Progress (%)', width: 13, value: (r) => r.progress },
  { header: 'Created', width: 12, value: (r) => r.createdAt.slice(0, 10) },
];

export function filterRows(rows: DprRow[], f: RegisterFilters) {
  const q = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.stream || r.stream === f.stream) &&
      (!f.stage || r.stage === f.stage) &&
      (!f.zone || r.zone === f.zone) &&
      (!f.circle || r.circle === f.circle) &&
      (!f.division || r.division === f.division) &&
      (!q || [r.id, r.project, r.location, r.station, r.division, r.circle, r.zone, r.voltage, r.stage].some((v) => v.toLowerCase().includes(q))),
  );
}

/** Short description of the active filters, used in the Excel notes. */
export function describeFilters(f: RegisterFilters) {
  const parts = [
    f.stream && `Type: ${f.stream}`,
    f.stage && `Stage: ${f.stage}`,
    f.zone && `Zone: ${f.zone}`,
    f.circle && `Circle: ${f.circle}`,
    f.division && `Division: ${f.division}`,
    f.q.trim() && `Search: "${f.q.trim()}"`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No filters';
}
