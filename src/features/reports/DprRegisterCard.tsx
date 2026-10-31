import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Download, FileStack, Loader2, Plus, Search } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { exportToExcel } from '@/lib/exportExcel';
import { useToast } from '@/lib/toast';
import { describeFilters, excelColumns, filterRows, type RegisterFilters } from './register';
import { stageTone } from './stage';
import { STAGES, type DprRow } from './types';

const PAGE_SIZE = 10;

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto appearance-none pr-7">
        <option value="">{`All ${label.toLowerCase()}s`}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
    </div>
  );
}

/** Filters live in the URL (?q=&stream=&stage=&division=) so a filtered view can be shared or bookmarked. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<RegisterFilters>(
    () => ({
      q: params.get('q') ?? '',
      stream: (params.get('stream') as RegisterFilters['stream']) ?? '',
      stage: (params.get('stage') as RegisterFilters['stage']) ?? '',
      division: params.get('division') ?? '',
    }),
    [params],
  );
  const set = (patch: Partial<RegisterFilters>) => {
    const next = { ...filters, ...patch };
    const out = new URLSearchParams();
    (Object.keys(next) as (keyof RegisterFilters)[]).forEach((k) => next[k] && out.set(k, next[k]));
    setParams(out, { replace: true });
  };
  return [filters, set] as const;
}

export function DprRegisterCard({ rows }: { rows: DprRow[] }) {
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const divisions = useMemo(() => [...new Set(rows.map((r) => r.division))].sort(), [rows]);
  const active = Boolean(filters.q || filters.stream || filters.stage || filters.division);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const update = (patch: Partial<RegisterFilters>) => {
    setFilters(patch);
    setPage(1);
  };

  const download = async () => {
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await exportToExcel({
        fileName: `DPR_Report_${filters.stream || 'All'}_${date}.xlsx`,
        sheetName: 'DPR Report',
        title: 'KPTCL DPR Report',
        notes: [`Generated ${new Date().toLocaleString('en-IN')}`, `${describeFilters(filters)} · ${filtered.length} DPRs`],
        columns: excelColumns,
        rows: filtered,
      });
      toast({ title: 'Report downloaded', description: `${filtered.length} ${filtered.length === 1 ? 'DPR' : 'DPRs'} exported to Excel.` });
    } catch {
      toast({ title: 'Download failed', description: 'Please try again.', tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const noRows = rows.length === 0;

  return (
    <Card role="region" aria-labelledby="register-title">
      <CardHeader
        id="register-title"
        title="DPR report"
        subtitle={noRows ? 'No DPRs yet' : `${filtered.length} of ${rows.length} DPRs`}
        action={
          <button
            type="button"
            className="btn-secondary"
            onClick={download}
            disabled={exporting || filtered.length === 0}
            title={filtered.length === 0 ? 'Nothing to download yet' : `Download the ${filtered.length} DPRs shown as .xlsx`}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
            Download Excel
          </button>
        }
      />

      {noRows ? (
        <EmptyState
          icon={FileStack}
          title="No DPRs yet"
          hint="Initialized DPRs are listed here. You can filter them and download the list as Excel."
          action={
            <Link to="/initialization" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden />
              Create your first DPR
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                type="search"
                aria-label="Filter DPRs"
                placeholder="Filter by ID, project, place…"
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                className="input pl-8"
              />
            </div>
            <FilterSelect label="Type" value={filters.stream} onChange={(v) => update({ stream: v as RegisterFilters['stream'] })} options={['Greenfield', 'Brownfield']} />
            <FilterSelect label="Stage" value={filters.stage} onChange={(v) => update({ stage: v as RegisterFilters['stage'] })} options={STAGES} />
            <FilterSelect label="Division" value={filters.division} onChange={(v) => update({ division: v })} options={divisions} />
            {active && (
              <button type="button" className="btn-ghost" onClick={() => update({ q: '', stream: '', stage: '', division: '' })}>
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No DPRs match these filters"
              action={
                <button type="button" className="btn-secondary" onClick={() => update({ q: '', stream: '', stage: '', division: '' })}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th scope="col" className="px-4 py-2 font-medium">DPR ID</th>
                    <th scope="col" className="px-4 py-2 font-medium">Project</th>
                    <th scope="col" className="px-4 py-2 font-medium">Type</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Voltage</th>
                    <th scope="col" className="px-4 py-2 font-medium">Division</th>
                    <th scope="col" className="px-4 py-2 font-medium">Stage</th>
                    <th scope="col" className="w-36 px-4 py-2 font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="num whitespace-nowrap px-4 py-2.5 text-gray-700">{r.id}</td>
                      <td className="max-w-md px-4 py-2.5">
                        <p className="line-clamp-2 text-gray-900" title={r.project}>
                          {r.project}
                        </p>
                        <p className="truncate text-xs text-gray-500">{r.location}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{r.stream}</td>
                      <td className="num whitespace-nowrap px-4 py-2.5 text-right text-gray-700">{r.voltage}</td>
                      <td className="px-4 py-2.5 text-gray-700">{r.division}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={stageTone[r.stage]}>{r.stage}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={r.progress} label={`${r.id} progress`} className="flex-1" />
                          <span className="num w-8 text-right text-xs text-gray-500">{r.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={current} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
