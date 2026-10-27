import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, className = "", id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="input-wrapper">
        {label && (
          <label htmlFor={selectId} className="input-label">
            {label}
          </label>
        )}
        <div className={`input-field ${error ? "input-error" : ""}`}>
          <select
            ref={ref}
            id={selectId}
            className={`select ${error ? "select-error" : ""} ${className}`}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={
              error
                ? `${selectId}-error`
                : helperText
                ? `${selectId}-helper`
                : undefined
            }
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="select-chevron" aria-hidden="true" />
        </div>
        {error && (
          <p id={`${selectId}-error`} className="input-error-text" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${selectId}-helper`} className="input-helper-text">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";