import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'md', className = '', children, ...props }, ref) => {
    const variants = {
      default: 'bg-primary/10 text-primary border-primary/20',
      success: 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400',
      warning: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400',
      danger: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400',
      info: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400',
      outline: 'bg-transparent text-text border-border',
    };
    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center font-medium rounded-full border ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';