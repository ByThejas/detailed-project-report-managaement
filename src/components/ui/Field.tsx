import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { controlClass } from './controlClass';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ id, label, hint, error, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ invalid, className = '', ...props }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={`${controlClass(invalid)} ${className}`} {...props} />;
});

/** `placeholder` adds an empty first option ("Units", "Rating") that can't be picked back once a value is chosen. */
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options: readonly string[]; placeholder?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, options, placeholder, className = '', ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} aria-invalid={invalid || undefined} className={`${controlClass(invalid)} appearance-none pr-9 ${className}`} {...props}>
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -trangray-y-1/2 text-gray-400" aria-hidden />
    </div>
  );
});
