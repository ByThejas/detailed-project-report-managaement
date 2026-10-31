import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatNumber, percentOf } from '@/lib/format';
import type { DivisionCompletion } from '../types';

type SortKey = 'division' | 'total' | 'inProgress' | 'generated' | 'progress';

const columns: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'division', label: 'Division', numeric: false },
  { key: 'total', label: 'Total', numeric: true },
  { key: 'inProgress', label: 'In progress', numeric: true },
  { key: 'generated', label: 'Generated', numeric: true },
  { key: 'progress', label: 'Progress', numeric: false },
];

const sortValue = (r: DivisionCompletion, key: SortKey): string | number => {
  if (key === 'division') return r.division.toLowerCase();
  if (key === 'progress') return r.total ? r.generated / r.total : 0;
  return r[key];
};

export function DivisionCompletionTable({ rows }: { rows: DivisionCompletion[] }) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.division.toLowerCase().includes(q)) : rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return x < y ? -factor : x > y ? factor : 0;
    });
  }, [rows, filter, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'division' ? 'asc' : 'desc' }));

  return (
    <Card role="region" aria-labelledby="completion-title">
      <CardHeader
        id="completion-title"
        title="Completion by division"
        subtitle={`${rows.length} ${rows.length === 1 ? 'division' : 'divisions'}`}
        action={
          <label className="relative">
            <span className="sr-only">Filter divisions</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              placeholder="Filter divisions"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input w-48 pl-8 sm:w-56"
            />
          </label>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              {columns.map((c) => {
                const active = sort.key === c.key;
                const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`px-4 py-2 font-medium ${c.numeric ? 'text-right' : 'text-left'} ${c.key === 'progress' ? 'w-48' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}
                    >
                      {c.label}
                      <Icon className="h-3 w-3" aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((r) => {
              const pct = percentOf(r.generated, r.total);
              return (
                <tr key={r.division} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/reports?division=${encodeURIComponent(r.division)}`} className="font-medium text-gray-900 hover:underline">
                      {r.division}
                    </Link>
                  </td>
                  <td className="num px-4 py-2.5 text-right text-gray-700">{formatNumber(r.total)}</td>
                  <td className="num px-4 py-2.5 text-right text-gray-700">{formatNumber(r.inProgress)}</td>
                  <td className="num px-4 py-2.5 text-right text-gray-700">{formatNumber(r.generated)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <ProgressBar value={pct} label={`${r.division} progress`} className="flex-1" />
                      <span className="num w-9 text-right text-xs text-gray-500">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-gray-500">
                  No divisions match “{filter}”
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
