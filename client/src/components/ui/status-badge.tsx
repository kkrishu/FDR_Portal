import * as React from 'react';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, { label: string; className: string; dot: string }> = {
  DRAFT: {
    label: 'Draft',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
  SUBMITTED: {
    label: 'Submitted',
    className:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
    dot: 'bg-blue-500',
  },
  AWAITING_BANK_VERIFICATION: {
    label: 'Awaiting bank',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-500',
  },
  BANK_VERIFIED: {
    label: 'Bank verified',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  BANK_FLAGGED: {
    label: 'Bank flagged',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
    dot: 'bg-red-500',
  },
  UNDER_REVIEW: {
    label: 'Under review',
    className:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900',
    dot: 'bg-indigo-500',
  },
  VERIFIED: {
    label: 'Verified',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  FLAGGED: {
    label: 'Flagged',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
    dot: 'bg-red-500',
  },
  MANUAL_VERIFIED: {
    label: 'Manually verified',
    className:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900',
    dot: 'bg-teal-500',
  },
  EXPIRED: {
    label: 'Expired',
    className:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900',
    dot: 'bg-orange-500',
  },
  RENEWAL_PENDING: {
    label: 'Renewal pending',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-500',
  },
  RENEWED: {
    label: 'Renewed',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  RELEASE_REQUESTED: {
    label: 'Release requested',
    className:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900',
    dot: 'bg-violet-500',
  },
  RELEASE_RECOMMENDED: {
    label: 'Release recommended',
    className:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900',
    dot: 'bg-sky-500',
  },
  RELEASE_APPROVED: {
    label: 'Release approved',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  RELEASE_REJECTED: {
    label: 'Release rejected',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
    dot: 'bg-red-500',
  },
  RELEASED: {
    label: 'Released',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
  ACTIVE: {
    label: 'Active',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  INACTIVE: {
    label: 'Inactive',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
  SUSPENDED: {
    label: 'Suspended',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
    dot: 'bg-red-500',
  },
  PENDING: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-500',
  },
};

const SEVERITY_STYLES: Record<string, string> = {
  BLOCK:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
  WARNING:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
  INFO: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  /** Show a leading dot. On by default; severity badges have no dot. */
  showDot?: boolean;
  severity?: boolean;
}

/** The single mapping from a workflow status string to a readable chip. */
export function StatusBadge({
  status,
  showDot = true,
  severity = false,
  className,
  ...props
}: StatusBadgeProps) {
  if (severity) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
          SEVERITY_STYLES[status] ?? SEVERITY_STYLES.INFO,
          className
        )}
        {...props}
      >
        {status}
      </span>
    );
  }

  const style = STATUS_STYLES[status] ?? {
    label: status.replace(/_/g, ' ').toLowerCase(),
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize',
        style.className,
        className
      )}
      {...props}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />}
      {style.label}
    </span>
  );
}

export { STATUS_STYLES };
