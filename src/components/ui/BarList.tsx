import { formatNumber, percentOf } from '@/lib/format';

export interface BarItem {
  key: string;
  label: string;
  value: number;
}

/** Ranked horizontal bars, scaled to the largest item. */
export function BarList({ items }: { items: BarItem[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));
  const sorted = [...items].sort((a, b) => b.value - a.value);

  return (
    <ul className="space-y-3">
      {sorted.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-gray-700">{item.label}</span>
            <span className="num text-gray-900">
              {formatNumber(item.value)}
              <span className="ml-2 inline-block w-9 text-right text-gray-400">{percentOf(item.value, total)}%</span>
            </span>
          </div>
          <div className="h-1 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
