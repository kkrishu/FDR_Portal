'use client';

/**
 * Shared FDR table.
 *
 * Every role shows the same deposits with slightly different columns, so the
 * table lives here: a fixed column set with optional extras, loading skeletons,
 * an empty state, and a link to the detail view.
 */

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Inbox } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

export interface FdrRow {
  id: string;
  fdrNumber: string;
  bankName: string;
  branchName?: string;
  ifscCode?: string;
  amount: number;
  status: string;
  maturityDate: string;
  issueDate?: string;
  riskScore?: number;
  assignedTo?: string | null;
  institution?: { id: string; name: string; code: string } | null;
  flags?: Array<{ id: string; severity: string; message: string }>;
}

interface FdrTableProps {
  rows: FdrRow[];
  loading?: boolean;
  /** Base path for the row link, e.g. `/dashboard/officer/cases`. */
  detailBase: string;
  /** Use the record id (default) or its FDR number in the URL. */
  detailKey?: 'id' | 'fdrNumber';
  showInstitution?: boolean;
  showRisk?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Hide the trailing chevron when the row is not navigable. */
  onRowClick?: (row: FdrRow) => void;
  className?: string;
}

export function FdrTable({
  rows,
  loading = false,
  detailBase,
  detailKey = 'id',
  showInstitution = false,
  showRisk = false,
  emptyTitle = 'No deposits yet',
  emptyDescription = 'Records will appear here once they are created.',
  emptyAction,
  onRowClick,
  className,
}: FdrTableProps) {
  if (loading) {
    return <FdrTableSkeleton showInstitution={showInstitution} showRisk={showRisk} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={cn(className)}>
      {/* Cards on phones: a 720px table would only offer sideways scrolling. */}
      <ul className="divide-y md:hidden">
        {rows.map((row) => {
          const href = `${detailBase}/${detailKey === 'id' ? row.id : row.fdrNumber}`;
          const flagged = (row.flags?.length ?? 0) > 0;
          return (
            <li key={row.id} className="animate-fade-in-up">
              <Link
                href={href}
                className="hover:bg-muted/40 flex flex-col gap-1.5 py-3 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-mono text-[12.5px] font-medium">
                      {row.fdrNumber}
                    </span>
                    {flagged && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                  </span>
                  <StatusBadge status={row.status} className="shrink-0" />
                </div>
                <div className="text-muted-foreground flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="min-w-0 truncate">
                    {showInstitution && row.institution ? `${row.institution.name} · ` : ''}
                    {row.bankName}
                    {row.branchName ? ` · ${row.branchName}` : ''}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCurrency(row.amount)}
                  </span>
                </div>
                <div className="text-muted-foreground flex items-center justify-between gap-3 text-[11px]">
                  <span>Matures {formatDate(row.maturityDate)}</span>
                  {showRisk && <RiskPill score={row.riskScore ?? 0} />}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b">
              <Th>FDR number</Th>
              {showInstitution && <Th>Institution</Th>}
              <Th>Bank / branch</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
              <Th>Maturity</Th>
              {showRisk && <Th align="right">Risk</Th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const href = `${detailBase}/${detailKey === 'id' ? row.id : row.fdrNumber}`;
              const flagged = (row.flags?.length ?? 0) > 0;

              return (
                <tr
                  key={row.id}
                  className="hover:bg-muted/50 animate-fade-in-up group border-b last:border-0"
                  style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
                >
                  <td className="py-3 pr-3">
                    <Link href={href} className="flex items-center gap-2">
                      <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono text-[12.5px] font-medium group-hover:underline">
                        {row.fdrNumber}
                      </span>
                      {flagged && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                          title={row.flags?.map((f) => f.message).join('; ')}
                        />
                      )}
                    </Link>
                  </td>
                  {showInstitution && (
                    <td className="text-muted-foreground py-3 pr-3 text-[12.5px]">
                      <span className="line-clamp-1">{row.institution?.name ?? '—'}</span>
                    </td>
                  )}
                  <td className="py-3 pr-3 text-[12.5px]">
                    <span className="line-clamp-1">{row.bankName}</span>
                    {row.branchName && (
                      <span className="text-muted-foreground line-clamp-1 text-[11px]">
                        {row.branchName}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right text-[12.5px] font-medium tabular-nums">
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="text-muted-foreground py-3 pr-3 text-[12.5px] tabular-nums">
                    {formatDate(row.maturityDate)}
                  </td>
                  {showRisk && (
                    <td className="py-3 pr-3 text-right">
                      <RiskPill score={row.riskScore ?? 0} />
                    </td>
                  )}
                  <td className="py-3 text-right">
                    {onRowClick ? (
                      <button
                        type="button"
                        onClick={() => onRowClick(row)}
                        className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
                        aria-label={`Open ${row.fdrNumber}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <Link
                        href={href}
                        className="text-muted-foreground hover:text-foreground inline-block rounded p-1 transition-colors"
                        aria-label={`Open ${row.fdrNumber}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={cn(
        'text-muted-foreground whitespace-nowrap pb-2.5 pr-3 text-[11px] font-semibold uppercase tracking-[0.06em]',
        align === 'right' && 'text-right'
      )}
    >
      {children}
    </th>
  );
}

export function RiskPill({ score }: { score: number }) {
  const tone =
    score >= 70
      ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
      : score >= 40
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';

  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-8 items-center justify-center rounded px-1.5 text-[11px] font-semibold tabular-nums',
        tone
      )}
    >
      {score}
    </span>
  );
}

export function FdrTableSkeleton({
  showInstitution = false,
  showRisk = false,
  rows = 6,
}: {
  showInstitution?: boolean;
  showRisk?: boolean;
  rows?: number;
}) {
  const columns = 5 + (showInstitution ? 1 : 0) + (showRisk ? 1 : 0);
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b pb-3 last:border-0">
          {Array.from({ length: columns }).map((__, cell) => (
            <Skeleton
              key={cell}
              className={cn('h-3.5', cell === 0 ? 'w-32' : cell === 2 ? 'ml-auto w-24' : 'w-24')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
