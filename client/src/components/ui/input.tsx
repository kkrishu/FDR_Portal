'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-primary flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        ref={ref}
        aria-invalid={error}
        aria-describedby={error ? ariaDescribedBy : undefined}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
