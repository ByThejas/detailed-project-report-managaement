interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}

/** Compact right-aligned number field for BOQ tables. Empty or invalid input counts as 0. */
export function NumberInput({ value, onChange, label, className = 'w-24', disabled }: NumberInputProps) {
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
      className={`num h-7 rounded border border-transparent bg-transparent px-1.5 text-right text-[13px] text-gray-900 hover:border-gray-200 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/15 ${className}`}
    />
  );
}
