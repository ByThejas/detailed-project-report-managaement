const indian = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** Formats a count or Rs. lakh value with Indian digit grouping; null shows an em dash. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return indian.format(value);
}

/** Whole-number share of `part` in `total`, e.g. 5 of 341 -> 1. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
