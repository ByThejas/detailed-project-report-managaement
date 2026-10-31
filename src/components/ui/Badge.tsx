import type { ReactNode } from 'react';

export type BadgeTone = 'gray' | 'blue' | 'amber' | 'violet' | 'orange' | 'green';

const dots: Record<BadgeTone, string> = {
  gray: 'bg-gray-400',
  blue: 'bg-accent-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
  green: 'bg-emerald-500',
};

/** Neutral pill with a small coloured dot: colour carries meaning without shouting. */
export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-gray-200 bg-white px-1.5 py-px text-xs text-gray-700">
      <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} aria-hidden />
      {children}
    </span>
  );
}
