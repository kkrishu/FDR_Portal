import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

/** Shown when a list is genuinely empty — not while it is loading. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className
      )}
      {...props}
    >
      {Icon && (
        <span
          className={cn(
            'bg-muted text-muted-foreground flex items-center justify-center rounded-full',
            compact ? 'h-9 w-9' : 'h-12 w-12'
          )}
        >
          <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
        </span>
      )}
      <div className="space-y-1">
        <p className={cn('font-medium', compact ? 'text-sm' : 'text-[15px]')}>{title}</p>
        {description && (
          <p className="text-muted-foreground mx-auto max-w-sm text-xs leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
