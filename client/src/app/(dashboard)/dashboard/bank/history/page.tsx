'use client';

/**
 * Verification history.
 *
 * Everything this bank has already confirmed or flagged, newest first.
 */

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, History, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface HistoryRow {
  id: string;
  status: string;
  completedAt: string | null;
  sentAt: string;
  assuranceLevel: string | null;
  fdr: {
    id: string;
    fdrNumber: string;
    amount: number;
    bankName: string;
    institution?: { name: string };
  };
}

export default function BankHistoryPage() {
  const [page, setPage] = React.useState(1);
  const { data, meta, isLoading, errorMessage } = useApi<HistoryRow[]>([
    '/verification/bank/history',
    { page, limit: 12 },
  ]);

  const rows = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Verification history"
          description="Requests your branch has already answered."
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={History}
                title="No verifications yet"
                description="Once your branch confirms a deposit, it is recorded here."
              />
            ) : (
              <div className="space-y-2">
                {rows.map((row, index) => {
                  const verified = row.status === 'VERIFIED';
                  return (
                    <div
                      key={row.id}
                      className="border-border/70 animate-fade-in-up flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-3"
                      style={{ animationDelay: `${Math.min(index, 14) * 20}ms` }}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          verified
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                        )}
                      >
                        {verified ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <ShieldAlert className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[12.5px] font-medium">
                          {row.fdr.fdrNumber}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          {row.fdr.institution?.name ?? row.fdr.bankName} ·{' '}
                          {formatCurrency(row.fdr.amount)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'text-[11.5px] font-medium',
                            verified
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {verified ? 'Confirmed' : 'Flagged'}
                        </p>
                        <p className="text-muted-foreground text-[10.5px] tabular-nums">
                          {formatDateTime(row.completedAt ?? row.sentAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {meta?.totalPages && meta.totalPages > 1 && (
              <Pagination
                page={meta.page ?? page}
                totalPages={meta.totalPages}
                total={meta.total}
                limit={meta.limit}
                onPageChange={setPage}
                className="border-t pt-4"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
