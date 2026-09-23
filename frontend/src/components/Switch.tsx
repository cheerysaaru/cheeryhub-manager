import { InputHTMLAttributes, forwardRef } from 'react';

export interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className = '', id, ...props }, ref) => {
    const switchId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <label className={`switch-wrapper ${className}`} htmlFor={switchId}>
        <input
          ref={ref}
          type="checkbox"
          id={switchId}
          role="switch"
          className="switch-input"
          {...props}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        {(label || description) && (
          <div className="switch-label">
            {label && <span className="switch-label-text">{label}</span>}
            {description && <span className="switch-description">{description}</span>}
          </div>
        )}
      </label>
    );
  }
);

Switch.displayName = 'Switch';