'use client';

/**
 * Bank verify.
 *
 * The branch-side entry point for confirming a deposit. A verification link
 * (emailed to the branch) lands on /verify/[token], which offers the same
 * confirmation form; this page is for a branch officer working from the portal.
 */

import * as React from 'react';
import Link from 'next/link';
import { Clock, FileCheck2, ShieldCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface PendingVerification {
  id: string;
  status: string;
  sentAt: string;
  tokenExpiry: string;
  fdr: {
    id: string;
    fdrNumber: string;
    amount: number;
    maturityDate: string;
    institution?: { name: string };
  };
}

export default function BankVerifyPage() {
  const { data, isLoading } = useApi<PendingVerification[]>([
    '/verification/bank/pending',
    { limit: 5 },
  ]);

  const rows = data ?? [];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Verify an FDR"
          description="Confirm a deposit's particulars against your branch records."
        />

        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="bg-muted/50 flex items-start gap-3 rounded-lg p-4">
              <FileCheck2 className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-[12.5px] leading-relaxed">
                <p className="font-medium">Two ways to verify</p>
                <p className="text-muted-foreground mt-1">
                  Use the secure link AICTE emailed you — it opens the confirmation form with the
                  deposit already loaded — or pick a pending request below to work from the portal.
                  Either way you confirm the amount, dates, holders and lien, and receive a one-time
                  password by email.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((key) => (
                  <div key={key} className="bg-muted/40 h-14 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground text-[12.5px]">
                No open requests right now. New requests appear in{' '}
                <Link href="/dashboard/bank/pending" className="text-primary hover:underline">
                  Pending
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                  Open requests
                </p>
                {rows.map((item) => {
                  const expired = new Date(item.tokenExpiry) < new Date();
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'border-border/70 flex items-center gap-3 rounded-lg border px-3.5 py-3',
                        expired && 'opacity-60'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[12.5px] font-medium">
                          {item.fdr.fdrNumber}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          {item.fdr.institution?.name ?? '—'} · {formatCurrency(item.fdr.amount)} ·{' '}
                          matures {formatDate(item.fdr.maturityDate)}
                        </p>
                      </div>
                      {expired ? (
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                          <Clock className="h-3 w-3" />
                          Expired
                        </span>
                      ) : (
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link href="/dashboard/bank/pending">
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                            Open
                          </Link>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
