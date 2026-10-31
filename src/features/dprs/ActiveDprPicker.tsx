import { useMemo } from 'react';
import { Combobox } from '@/components/ui/Combobox';
import type { DprRow } from '@/features/reports/types';

export function ActiveDprPicker({ rows, value, onChange }: { rows: DprRow[]; value: string; onChange: (id: string) => void }) {
  const options = useMemo(() => rows.map((d) => ({ id: d.id, name: `${d.id} — ${d.project}` })), [rows]);
  return (
    <div>
      <label htmlFor="active-dpr" className="label-muted mb-1.5 block">
        Active DPR
      </label>
      <Combobox
        id="active-dpr"
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Search by DPR ID or project name…"
        disabled={rows.length === 0}
      />
    </div>
  );
}
