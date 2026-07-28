import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusDotVariants = cva(
  'shrink-0 rounded-full',
  {
    variants: {
      status: {
        connected: 'bg-green-500',
        connecting: 'bg-yellow-500 animate-pulse',
        disconnected: 'bg-red-500',
        idle: 'bg-muted-foreground',
      },
      size: {
        default: 'h-2.5 w-2.5',
        sm: 'h-2 w-2',
        lg: 'h-3 w-3',
      },
    },
    defaultVariants: {
      status: 'idle',
      size: 'default',
    },
  }
);

export interface StatusDotProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusDotVariants> {}

const StatusDot = React.forwardRef<HTMLDivElement, StatusDotProps>(
  ({ className, status, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(statusDotVariants({ status, size }), className)}
        {...props}
      />
    );
  }
);
StatusDot.displayName = 'StatusDot';

export { StatusDot };
