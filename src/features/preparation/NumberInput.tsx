interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  /** A visible field box (forms). Without it the field is borderless until hovered (table cells). */
  boxed?: boolean;
  /** Amber border to flag a value that still needs filling in. Boxed fields only. */
  warn?: boolean;
}

const base =
  'num border text-right text-[13px] text-gray-900 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/15 disabled:cursor-not-allowed disabled:text-gray-400';
const inline = 'h-7 rounded border-transparent bg-transparent px-1.5 hover:border-gray-200';
const box = 'h-8 rounded-md bg-white px-2.5';

/** Compact right-aligned number field for BOQ tables and forms. Empty or invalid input counts as 0. */
export function NumberInput({ value, onChange, label, className = 'w-24', disabled, boxed, warn }: NumberInputProps) {
  const look = boxed ? `${box} ${warn ? 'border-amber-300' : 'border-gray-200 hover:border-gray-300'}` : inline;
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      aria-label={label}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = e.target.valueAsNumber;
        onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
      className={`${base} ${look} ${className}`}
    />
  );
}
