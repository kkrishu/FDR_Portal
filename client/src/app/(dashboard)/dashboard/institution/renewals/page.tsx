'use client';

/**
 * Renewals.
 *
 * Shows deposits that are expired or about to mature, with the renewal action
 * inline. A renewal creates a linked draft with the same institution and
 * branch, so the new record starts from the right place.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

interface FdrRow {
  id: string;
  fdrNumber: string;
  bankName: string;
  branchName: string;
  amount: number;
  status: string;
  maturityDate: string;
  interestRate: number | null;
}

const RENEWABLE_STATUSES = ['VERIFIED', 'MANUAL_VERIFIED', 'EXPIRED', 'RENEWAL_PENDING'];

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function InstitutionRenewalsPage() {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // One request per bucket keeps the buckets honest and the payload small.
  const { data: expiring, isLoading: loadingExpiring } = useApi<FdrRow[]>([
    '/fdrs',
    { limit: 10, status: 'VERIFIED', sortBy: 'maturityDate', sortOrder: 'asc' },
  ]);
  const { data: expired, isLoading: loadingExpired } = useApi<FdrRow[]>([
    '/fdrs',
    { limit: 10, status: 'EXPIRED', sortBy: 'maturityDate', sortOrder: 'asc' },
  ]);
  const { data: renewed, isLoading: loadingRenewed } = useApi<FdrRow[]>([
    '/fdrs',
    { limit: 5, status: 'RENEWED', sortBy: 'createdAt', sortOrder: 'desc' },
  ]);

  const renew = useDynamicMutation('post', {
    successMessage: 'Renewal draft created',
    revalidate: ['/fdrs', '/dashboard/summary'],
  });

  const handleRenew = async (fdr: FdrRow) => {
    setPendingId(fdr.id);
    try {
      const created: any = await renew.run(`/fdrs/${fdr.id}/renew`, {});
      if (created?.id) router.push(`/dashboard/institution/fdrs/${created.id}`);
    } catch {
      // The toast already reported it.
    } finally {
      setPendingId(null);
    }
  };

  const dueSoon = (expiring ?? []).filter((fdr) => {
    const days = daysUntil(fdr.maturityDate);
    return days >= 0 && days <= 90 && RENEWABLE_STATUSES.includes(fdr.status);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Renewals"
          description="Deposits approaching maturity, plus anything that has already lapsed."
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-[15px] font-semibold">Due within 90 days</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingExpiring ? (
                <ListSkeleton />
              ) : dueSoon.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarClock}
                  title="Nothing due soon"
                  description="No verified deposit matures in the next three months."
                />
              ) : (
                <ul className="divide-y">
                  {dueSoon.map((fdr) => {
                    const days = daysUntil(fdr.maturityDate);
                    return (
                      <li
                        key={fdr.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/institution/fdrs/${fdr.id}`}
                            className="block truncate font-mono text-[12.5px] font-medium hover:underline"
                          >
                            {fdr.fdrNumber}
                          </Link>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {fdr.bankName} · matures {formatDate(fdr.maturityDate)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[12.5px] font-medium tabular-nums">
                            {formatCurrency(fdr.amount)}
                          </p>
                          <p
                            className={cn(
                              'text-[11px] font-medium',
                              days <= 15
                                ? 'text-red-600 dark:text-red-400'
                                : days <= 45
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {days} days left
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => handleRenew(fdr)}
                          disabled={pendingId === fdr.id}
                        >
                          {pendingId === fdr.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span className="sr-only">Renew {fdr.fdrNumber}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-3">
                <CalendarClock className="h-4 w-4 text-red-500" />
                <CardTitle className="text-[15px] font-semibold">Expired</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingExpired ? (
                  <ListSkeleton rows={2} />
                ) : (expired ?? []).length === 0 ? (
                  <p className="text-muted-foreground py-3 text-[12.5px]">No deposit has lapsed.</p>
                ) : (
                  <ul className="divide-y">
                    {(expired ?? []).map((fdr) => (
                      <li
                        key={fdr.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/institution/fdrs/${fdr.id}`}
                            className="block truncate font-mono text-[12.5px] font-medium hover:underline"
                          >
                            {fdr.fdrNumber}
                          </Link>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {fdr.bankName} · matured {formatDate(fdr.maturityDate)}
                          </p>
                        </div>
                        <StatusBadge status={fdr.status} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => handleRenew(fdr)}
                          disabled={pendingId === fdr.id}
                        >
                          {pendingId === fdr.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span className="sr-only">Renew {fdr.fdrNumber}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {(renewed ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-[15px] font-semibold">Recently renewed</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {loadingRenewed ? (
                    <ListSkeleton rows={2} />
                  ) : (
                    <ul className="divide-y">
                      {(renewed ?? []).map((fdr) => (
                        <li key={fdr.id} className="flex items-center justify-between gap-3 py-2.5">
                          <Link
                            href={`/dashboard/institution/fdrs/${fdr.id}`}
                            className="truncate font-mono text-[12.5px] hover:underline"
                          >
                            {fdr.fdrNumber}
                          </Link>
                          <span className="text-muted-foreground shrink-0 text-[11.5px] tabular-nums">
                            {formatCurrency(fdr.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}
