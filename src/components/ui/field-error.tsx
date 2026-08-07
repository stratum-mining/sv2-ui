import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FieldErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  message?: string | null;
}

const FieldError = React.forwardRef<HTMLParagraphElement, FieldErrorProps>(
  ({ className, message, ...props }, ref) => {
    if (!message) return null;

    return (
      <p
        ref={ref}
        className={cn('text-xs text-red-600 dark:text-red-500 mt-1.5 font-medium', className)}
        {...props}
      >
        {message}
      </p>
    );
  }
);
FieldError.displayName = 'FieldError';

export { FieldError };
