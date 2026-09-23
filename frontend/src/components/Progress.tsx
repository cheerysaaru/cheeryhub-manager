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
    const sizes = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };
    const variants = {
      default: 'bg-primary',
      success: 'bg-green-500',
      warning: 'bg-yellow-500',
      danger: 'bg-red-500',
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
          <div className={`progress-fill ${variants[variant]}`} style={{ width: `${percentage}%` }} />
        </div>
        <style>{`
          .progress-wrapper { width: 100%; }
          .progress-label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.875rem; font-weight: 500; color: var(--text); }
          .progress-track { width: 100%; background: var(--border); border-radius: 999px; overflow: hidden; }
          .progress-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
        `}</style>
      </div>
    );
  }
);

Progress.displayName = 'Progress';