'use client';

/**
 * Bank pending queue.
 *
 * Verification requests addressed to this bank that are still open. Each row
 * links to the public verify page with the same token the branch received by
 * email, so the flow is identical whether it starts from the portal or the
 * inbox.
 */

import * as React from 'react';
import Link from 'next/link';
import { Clock, Inbox, Mail, ShieldCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

interface PendingVerification {
  id: string;
  tokenHash: string;
  channel: string;
  status: string;
  sentToEmail: string;
  sentAt: string;
  tokenExpiry: string;
  fdr: {
    id: string;
    fdrNumber: string;
    bankName: string;
    branchName: string;
    amount: number;
    issueDate: string;
    maturityDate: string;
    institution?: { name: string };
  };
  bankBranch?: { branchName: string; bank?: { name: string } };
}

export default function BankPendingPage() {
  const [page, setPage] = React.useState(1);
  const { data, meta, isLoading, errorMessage } = useApi<PendingVerification[]>([
    '/verification/bank/pending',
    { page, limit: 10 },
  ]);

  const rows = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Pending verification"
          description="Deposits your branch has been asked to confirm. Open one to verify its details."
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
                {[0, 1, 2].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing waiting on you"
                description="When AICTE asks your branch to confirm a deposit, it appears here and by email."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/bank/verify">Verify from a link instead</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {rows.map((item, index) => {
                  const expired = new Date(item.tokenExpiry) < new Date();
                  return (
                    <div
                      key={item.id}
                      className="border-border/70 hover:bg-muted/40 animate-fade-in-up flex flex-wrap items-center gap-4 rounded-lg border p-4 transition-colors"
                      style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] font-semibold">
                            {item.fdr.fdrNumber}
                          </span>
                          <StatusBadge status={expired ? 'EXPIRED' : 'PENDING'} />
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-[12px]">
                          {item.fdr.institution?.name ?? item.fdr.bankName} ·{' '}
                          {formatCurrency(item.fdr.amount)} · matures{' '}
                          {formatDate(item.fdr.maturityDate)}
                        </p>
                        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[11px]">
                          <Mail className="h-3 w-3" />
                          Sent to {item.sentToEmail} on {formatDateTime(item.sentAt)}
                        </p>
                      </div>

                      {expired ? (
                        <span className="text-muted-foreground shrink-0 text-[11.5px]">
                          Link expired {formatDate(item.tokenExpiry)} — ask AICTE to resend
                        </span>
                      ) : (
                        <Button asChild size="sm" className="shrink-0">
                          <Link href={`/verify/pending`}>
                            <ShieldCheck className="mr-1.5 h-4 w-4" />
                            Review request
                          </Link>
                        </Button>
                      )}
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
