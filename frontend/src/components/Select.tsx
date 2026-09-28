import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, className = '', id, children, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="input-wrapper">
        {label && <label htmlFor={selectId} className="input-label">{label}</label>}
        <select
          ref={ref}
          id={selectId}
          className={`select ${error ? 'input-error' : ''} ${className}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          {...props}
        >
          {children}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p id={`${selectId}-error`} className="input-error-text" role="alert">{error}</p>}
        {helperText && !error && <p id={`${selectId}-helper`} className="input-helper-text">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';