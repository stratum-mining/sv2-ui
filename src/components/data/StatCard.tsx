import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: ReactNode;
  subtitle?: string;
  className?: string;
}

/**
 * A compact stat card.
 */
export function StatCard({
  title,
  value,
  subtitle,
  className,
}: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      <div className="text-xl font-semibold font-mono tracking-tight">
        {value}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}
