interface ProgressBarProps {
  /** 0–100 */
  value: number;
  label: string;
  className?: string;
}

export function ProgressBar({ value, label, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1 overflow-hidden rounded-full bg-gray-100 ${className}`}
    >
      <div className="h-full rounded-full bg-accent-600" style={{ width: `${pct}%` }} />
    </div>
  );
}
