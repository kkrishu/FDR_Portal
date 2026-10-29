'use client';

/**
 * Release requests.
 *
 * Lists real release requests with their workflow state, and lets the
 * institution start a new one from any deposit that is currently releasable.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Calendar, CheckCircle2, Clock, Plus, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ReleaseRequestRow {
  id: string;
  fdrId: string;
  reason: string;
  status: string;
  requestedAt: string;
  recommendedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  slaDeadline: string | null;
  fdr: {
    id: string;
    fdrNumber: string;
    amount: number;
    bankName: string;
    institution?: { name: string };
  };
  requestedByUser?: { name: string };
  recommendedByUser?: { name: string } | null;
  approvedByUser?: { name: string } | null;
}

const STAGES = ['REQUESTED', 'RECOMMENDED', 'APPROVED'] as const;

export default function InstitutionReleasesPage() {
  const [page, setPage] = React.useState(1);
  const { data, meta, isLoading, errorMessage } = useApi<ReleaseRequestRow[]>([
    '/release/requests',
    { page, limit: 10 },
  ]);

  const requests = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Release requests"
          description="Ask AICTE to release a deposit once it is no longer required."
          actions={
            <Button asChild size="sm">
              <Link href="/dashboard/institution/fdrs?status=VERIFIED">
                <Plus className="mr-1.5 h-4 w-4" />
                Start a request
              </Link>
            </Button>
          }
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-3 py-5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-4">
              <EmptyState
                icon={ArrowLeftRight}
                title="No release requests"
                description="Open a verified deposit and choose “Request release” to begin. Your officer reviews it and an administrator approves it."
                action={
                  <Button asChild size="sm">
                    <Link href="/dashboard/institution/fdrs?status=VERIFIED">
                      View verified deposits
                    </Link>
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request, index) => (
              <Card
                key={request.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }}
              >
                <CardContent className="space-y-3.5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/institution/fdrs/${request.fdr.id}`}
                          className="font-mono text-[13px] font-semibold hover:underline"
                        >
                          {request.fdr.fdrNumber}
                        </Link>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[12px]">
                        {request.fdr.bankName} · {formatCurrency(request.fdr.amount)}
                      </p>
                    </div>
                    <p className="text-muted-foreground shrink-0 text-[11px]">
                      Requested {formatDate(request.requestedAt)}
                    </p>
                  </div>

                  <p className="bg-muted/50 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed">
                    {request.reason}
                  </p>

                  {request.status === 'REJECTED' ? (
                    <div className="flex items-start gap-2 text-[12px] text-red-600 dark:text-red-400">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Rejected
                        {request.rejectionReason ? `: ${request.rejectionReason}` : '.'}
                      </span>
                    </div>
                  ) : (
                    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {STAGES.map((stage, stageIndex) => {
                        // RELEASED is past APPROVED, so it completes the strip.
                        const reachedIndex =
                          request.status === 'RELEASED'
                            ? STAGES.length
                            : STAGES.indexOf(request.status as any);
                        const done = stageIndex < reachedIndex;
                        const current = stage === request.status;
                        const reached = done || current;
                        return (
                          <li key={stage} className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                                reached
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {done ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : current ? (
                                <Clock className="h-3 w-3" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                              )}
                              {stage.charAt(0) + stage.slice(1).toLowerCase()}
                            </span>
                            {stageIndex < STAGES.length - 1 && (
                              <span className="bg-border hidden h-px w-5 sm:block" />
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {request.slaDeadline &&
                    ['REQUESTED', 'CHECKLIST_PENDING', 'RECOMMENDED'].includes(request.status) && (
                      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                        <Calendar className="h-3 w-3" />
                        Target decision {formatDate(request.slaDeadline)}
                      </p>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {meta?.totalPages && meta.totalPages > 1 && (
          <Pagination
            page={meta.page ?? page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={setPage}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
