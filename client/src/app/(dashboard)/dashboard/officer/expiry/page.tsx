'use client';

/**
 * Expiry tracker.
 *
 * Groups held deposits by how soon they mature. The backend returns the buckets
 * already grouped, so the page only decides how to present them.
 */

import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, Clock } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/lib/hooks/use-api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

interface ExpiryFdr {
  id: string;
  fdrNumber: string;
  bankName: string;
  amount: number;
  status: string;
  maturityDate: string;
  institution?: { name: string };
}

type ExpiryBuckets = Record<string, ExpiryFdr[]>;

const BUCKETS = [
  { key: 'overdue', label: 'Already matured', tone: 'text-red-600 dark:text-red-400' },
  { key: '7', label: 'Within 7 days', tone: 'text-red-600 dark:text-red-400' },
  { key: '15', label: '8–15 days', tone: 'text-amber-600 dark:text-amber-400' },
  { key: '30', label: '16–30 days', tone: 'text-amber-600 dark:text-amber-400' },
  { key: '60', label: '31–60 days', tone: 'text-muted-foreground' },
] as const;

export default function OfficerExpiryPage() {
  // Asking for the widest bucket makes the backend fill every range below it.
  const { data, isLoading, errorMessage } = useApi<ExpiryBuckets>([
    '/officer/expiry',
    { bucket: 60 },
  ]);

  const total = Object.values(data ?? {}).reduce((sum, list) => sum + list.length, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Expiry tracker"
          description="Held deposits grouped by how soon they mature, so renewals never slip."
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-3 py-5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : total === 0 ? (
          <Card>
            <CardContent className="py-4">
              <EmptyState
                icon={CalendarClock}
                title="No deposits maturing soon"
                description="Nothing held is due within the next 60 days."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {BUCKETS.map((bucket, index) => {
              const rows = data?.[bucket.key] ?? [];
              if (rows.length === 0) return null;
              return (
                <Card
                  key={bucket.key}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <Clock className={cn('h-4 w-4', bucket.tone)} />
                    <CardTitle className="text-[14px] font-semibold">{bucket.label}</CardTitle>
                    <span className="bg-muted text-muted-foreground ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums">
                      {rows.length}
                    </span>
                  </CardHeader>
                  <CardContent className="max-h-[340px] space-y-2.5 overflow-y-auto pt-0">
                    {rows.map((fdr) => (
                      <Link
                        key={fdr.id}
                        href={`/dashboard/officer/cases/${fdr.id}`}
                        className="hover:bg-muted/50 -mx-1.5 block rounded-lg px-1.5 py-2 transition-colors"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-mono text-[12px] font-medium">
                            {fdr.fdrNumber}
                          </span>
                          <span className="shrink-0 text-[11.5px] font-medium tabular-nums">
                            {formatCurrency(fdr.amount)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="text-muted-foreground truncate text-[11px]">
                            {fdr.institution?.name ?? fdr.bankName}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-[10.5px] tabular-nums">
                            {formatDate(fdr.maturityDate)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
