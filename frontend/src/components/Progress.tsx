import { HTMLAttributes, forwardRef } from 'react';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, max = 100, size = 'md', showLabel = false, label, variant = 'default', className = '', ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    const sizes = { sm: 'progress-sm', md: 'progress-md', lg: 'progress-lg' };
    const variants = {
      default: '',
      success: 'success',
      warning: 'warning',
      danger: 'danger',
    };

    return (
      <div ref={ref} className={`progress-wrapper ${className}`} {...props}>
        {(showLabel || label) && (
          <div className="progress-label">
            <span>{label || `${Math.round(percentage)}%`}</span>
            <span>{Math.round(percentage)}%</span>
          </div>
        )}
        <div className={`progress-track ${sizes[size]}`} role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className={`progress-fill ${variants[variant] || ''}`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  }
);

Progress.displayName = 'Progress';