import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 text-sm flex gap-3 text-left',
  {
    variants: {
      variant: {
        neutral: 'bg-muted/50 border-border text-muted-foreground',
        warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-500',
        destructive: 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-500',
        success: 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-500',
        info: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-500',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, icon, children, role, ...props }, ref) => {
    // Auto-assign ARIA roles based on variant if not explicitly provided
    const defaultRole = variant === 'destructive' || variant === 'warning' ? 'alert' : 'status';

    // Auto-assign default icons if not explicitly overridden (can pass icon={null} to remove)
    let DefaultIcon = null;
    if (icon === undefined) {
      if (variant === 'destructive' || variant === 'warning') DefaultIcon = AlertCircle;
      else if (variant === 'success') DefaultIcon = CheckCircle2;
      else if (variant === 'info') DefaultIcon = Info;
    }

    return (
      <div
        ref={ref}
        role={role || defaultRole}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {(icon !== undefined ? icon : DefaultIcon) && (
          <span className="mt-0.5 flex-shrink-0">
            {icon !== undefined ? icon : DefaultIcon && <DefaultIcon className="h-4 w-4" aria-hidden="true" />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    );
  }
);
Alert.displayName = 'Alert';

// Reusable alert title component
const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('font-medium leading-none tracking-tight mb-1.5', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

// Reusable alert description component
const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed opacity-90', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
