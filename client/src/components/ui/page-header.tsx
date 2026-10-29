import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}

/** The one heading block every dashboard page uses. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow}
        <h1 className="text-foreground truncate text-[22px] font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
