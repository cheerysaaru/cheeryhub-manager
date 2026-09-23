import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
    const variants = {
      primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active focus-visible:ring-primary',
      secondary: 'bg-secondary text-secondary-fg hover:bg-secondary-hover active:bg-secondary-active focus-visible:ring-secondary',
      outline: 'border border-border bg-transparent hover:bg-hover active:bg-active focus-visible:ring-primary',
      ghost: 'bg-transparent hover:bg-hover active:bg-active focus-visible:ring-primary',
      danger: 'bg-danger text-white hover:bg-danger-hover active:bg-danger-active focus-visible:ring-danger',
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-sm min-h-[36px]',
      md: 'px-4 py-2 text-base min-h-[44px]',
      lg: 'px-6 py-3 text-lg min-h-[52px]',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <span className="spinner" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';