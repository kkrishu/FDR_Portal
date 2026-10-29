'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ElementType;
  href?: string;
  trend?: { value: number; label?: string };
  tone?: 'default' | 'positive' | 'warning' | 'critical' | 'info';
  loading?: boolean;
  className?: string;
}

const TONE_STYLES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-muted text-foreground',
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
};

/**
 * A KPI tile. When `href` is set the whole card is a link, so "Active FDRs"
 * actually takes you to the filtered list instead of just looking clickable.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  trend,
  tone = 'default',
  loading = false,
  className,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <p className="text-[26px] font-semibold tabular-nums leading-tight tracking-[-0.02em]">
              {value}
            </p>
          )}
          {hint && !loading && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          {trend && !loading && (
            <p
              className={cn(
                'flex items-center gap-1 text-[11px] font-medium',
                trend.value >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {trend.value >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(trend.value)}% {trend.label ?? ''}
            </p>
          )}
        </div>
        {Icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              TONE_STYLES[tone]
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      {href && (
        <ArrowUpRight className="text-muted-foreground/50 group-hover:text-foreground absolute right-3 top-3 h-3.5 w-3.5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      )}
    </>
  );

  const base = cn(
    'bg-card relative overflow-hidden rounded-xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
    href &&
      'group transition-all duration-200 hover:border-border hover:shadow-[0_4px_16px_-6px_rgba(15,23,42,0.16)] active:scale-[0.995]',
    className
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }

  return <div className={base}>{content}</div>;
}
