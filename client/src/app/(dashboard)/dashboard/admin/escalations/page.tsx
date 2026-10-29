'use client';

/**
 * Escalations.
 *
 * Three lists the SLA rules generate: deposits past maturity without renewal,
 * bank verification requests with no reply past the escalation window, and
 * release requests that blew their deadline. Each row links to the record so
 * the cause can be dealt with directly.
 */

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, CalendarClock, FileWarning } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface OverdueRenewal {
  id: string;
  fdrNumber: string;
  amount: number;
  maturityDate: string;
  type: 'OVERDUE_RENEWAL';
  institution?: { name: string };
}

interface BankNoReply {
  id: string;
  sentAt: string;
  sentToEmail: string;
  type: 'BANK_NO_REPLY';
  fdr: { id: string; fdrNumber: string; amount: number; institution?: { name: string } };
}

interface SlaBreach {
  id: string;
  status: string;
  slaDeadline: string | null;
  requestedAt: string;
  type: 'SLA_BREACH';
  fdr: { id: string; fdrNumber: string; amount: number; institution?: { name: string } };
}

interface Escalations {
  overdueRenewals: OverdueRenewal[];
  bankNoReply: BankNoReply[];
  slaBreaches: SlaBreach[];
}

export default function AdminEscalationsPage() {
  const { data, isLoading, errorMessage } = useApi<Escalations>('/admin/escalations');

  const overdue = data?.overdueRenewals ?? [];
  const noReply = data?.bankNoReply ?? [];
  const breaches = data?.slaBreaches ?? [];
  const total = overdue.length + noReply.length + breaches.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Escalations"
          description={
            total === 0
              ? 'Nothing has breached a service level.'
              : `${total} item${total === 1 ? '' : 's'} need attention, grouped by cause.`
          }
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-3 py-5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : total === 0 ? (
          <Card>
            <CardContent className="py-4">
              <EmptyState
                icon={AlertTriangle}
                title="No escalations"
                description="Overdue renewals, silent banks, and missed SLAs will appear here."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <EscalationColumn
              title="Overdue renewals"
              icon={CalendarClock}
              count={overdue.length}
              emptyText="No deposit has lapsed without renewal."
              rows={overdue.map((item) => ({
                id: item.id,
                href: `/dashboard/officer/cases/${item.id}`,
                title: item.fdrNumber,
                subtitle: `${item.institution?.name ?? '—'} · matured ${formatDate(item.maturityDate)}`,
                trailing: formatCurrency(item.amount),
              }))}
            />
            <EscalationColumn
              title="Bank not responding"
              icon={Banknote}
              count={noReply.length}
              emptyText="Every verification request has been answered."
              rows={noReply.map((item) => ({
                id: item.id,
                href: `/dashboard/officer/cases/${item.fdr.id}`,
                title: item.fdr.fdrNumber,
                subtitle: `Sent ${formatDate(item.sentAt)} · ${item.sentToEmail}`,
                trailing: formatCurrency(item.fdr.amount),
              }))}
            />
            <EscalationColumn
              title="SLA breaches"
              icon={FileWarning}
              count={breaches.length}
              emptyText="No release request has missed its deadline."
              rows={breaches.map((item) => ({
                id: item.id,
                href: `/dashboard/officer/cases/${item.fdr.id}`,
                title: item.fdr.fdrNumber,
                subtitle: `${item.status.replace(/_/g, ' ').toLowerCase()} · deadline ${formatDate(item.slaDeadline ?? item.requestedAt)}`,
                trailing: formatCurrency(item.fdr.amount),
              }))}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function EscalationColumn({
  title,
  icon: Icon,
  count,
  rows,
  emptyText,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  rows: Array<{ id: string; href: string; title: string; subtitle: string; trailing: string }>;
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="h-4 w-4 text-amber-500" />
        <CardTitle className="text-[14px] font-semibold">{title}</CardTitle>
        <span
          className={
            count > 0
              ? 'ml-auto rounded-full bg-red-50 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-red-700 dark:bg-red-950/50 dark:text-red-300'
              : 'text-muted-foreground ml-auto text-[10.5px] tabular-nums'
          }
        >
          {count}
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        {count === 0 ? (
          <p className="text-muted-foreground py-3 text-[12px]">{emptyText}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="hover:bg-muted/40 -mx-1.5 block rounded-lg px-1.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[12px] font-medium">{row.title}</span>
                    <span className="shrink-0 text-[11.5px] font-medium tabular-nums">
                      {row.trailing}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                    {row.subtitle}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
