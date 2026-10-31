import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { controlClass } from './controlClass';

export interface ComboOption {
  id: string;
  name: string;
}

interface ComboboxProps {
  id: string;
  options: ComboOption[];
  value: string;
  onChange: (id: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/** Searchable single-select. Type to filter, arrow keys to move, Enter to pick, Escape to close. */
export function Combobox({ id, options, value, onChange, onBlur, placeholder = 'Search…', disabled, invalid, describedBy }: ComboboxProps) {
  const listId = useId();
  const selected = options.find((o) => o.id === value);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the text in step when the value is changed from outside (e.g. reset).
  useEffect(() => setQuery(selected?.name ?? ''), [selected?.name]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === selected?.name.toLowerCase()) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query, selected?.name]);

  const pick = (o: ComboOption) => {
    onChange(o.id);
    setQuery(o.name);
    setOpen(false);
  };

  const close = () => {
    setOpen(false);
    setQuery(selected?.name ?? '');
    onBlur?.();
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active]!.id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        className={`${controlClass(invalid)} pr-9`}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (value) onChange('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === 'Escape') {
            close();
          }
        }}
      />
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -trangray-y-1/2 text-gray-400" aria-hidden />

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-[13px] shadow-md"
        >
          {matches.length === 0 && <li className="px-3 py-1.5 text-gray-500">No matches</li>}
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={o.id === value}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between px-3 py-1.5 ${i === active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}`}
            >
              {o.name}
              {o.id === value && <Check className="h-4 w-4" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
