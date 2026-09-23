import { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="input-wrapper">
        {label && <label htmlFor={textareaId} className="input-label">{label}</label>}
        <textarea
          ref={ref}
          id={textareaId}
          className={`textarea ${error ? 'input-error' : ''} ${className}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {error && <p id={`${textareaId}-error`} className="input-error-text" role="alert">{error}</p>}
        {helperText && !error && <p id={`${textareaId}-helper`} className="input-helper-text">{helperText}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';