'use client';

/**
 * Review queue.
 *
 * Every deposit awaiting an officer decision, ordered by risk by default. An
 * officer can claim a case (assign to themselves) so "My Cases" is meaningful,
 * and filters narrow by status and risk.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Loader2, Search, UserCheck, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { FdrTable, type FdrRow } from '@/components/fdr/fdr-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';

const QUEUE_STATUSES = [
  { value: '', label: 'Everything' },
  { value: 'SUBMITTED', label: 'New' },
  { value: 'BANK_VERIFIED', label: 'Bank verified' },
  { value: 'BANK_FLAGGED', label: 'Bank flagged' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'FLAGGED', label: 'Flagged' },
  { value: 'RELEASE_REQUESTED', label: 'Release' },
];

const RISK_FILTERS = [
  { value: '', label: 'Any risk' },
  { value: '70', label: 'High (70+)' },
  { value: '40', label: 'Medium (40+)' },
];

export default function OfficerQueuePage() {
  const router = useRouter();

  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState('');
  const [riskMin, setRiskMin] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, meta, isLoading, errorMessage, refresh } = useApi<FdrRow[]>([
    '/officer/queue',
    {
      page,
      limit: 10,
      sortBy: 'riskScore',
      sortOrder: 'desc',
      ...(status ? { status } : {}),
      ...(riskMin ? { riskScoreMin: riskMin } : {}),
    },
  ]);

  const claim = useDynamicMutation('post', {
    successMessage: 'Case assigned to you',
    revalidate: ['/officer/queue', '/officer/cases', '/dashboard/summary'],
  });

  const handleClaim = async (row: FdrRow) => {
    await claim.run(`/officer/fdrs/${row.id}/assign`, {}).catch(() => undefined);
    await refresh();
  };

  // The queue endpoint has no free-text filter, so narrow client-side on the
  // page we already loaded. The dedicated Search page covers the whole corpus.
  const rows = (data ?? []).filter((row) => {
    if (!debounced) return true;
    const term = debounced.toLowerCase();
    return (
      row.fdrNumber.toLowerCase().includes(term) ||
      row.bankName.toLowerCase().includes(term) ||
      (row.institution?.name ?? '').toLowerCase().includes(term)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Review queue"
          description="Deposits awaiting a decision, highest risk first."
          actions={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/officer/cases">My cases</Link>
            </Button>
          }
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Filter this page by FDR, bank, or institution…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5"
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {RISK_FILTERS.map((filter) => (
                  <button
                    key={filter.value || 'any'}
                    type="button"
                    onClick={() => {
                      setRiskMin(filter.value);
                      setPage(1);
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                      riskMin === filter.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
              {QUEUE_STATUSES.map((filter) => (
                <button
                  key={filter.value || 'all'}
                  type="button"
                  onClick={() => {
                    setStatus(filter.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                    status === filter.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <FdrTable
              rows={rows}
              loading={isLoading}
              detailBase="/dashboard/officer/cases"
              detailKey="id"
              showInstitution
              showRisk
              emptyTitle="The queue is clear"
              emptyDescription="No deposit is waiting on a review decision."
              onRowClick={(row) => router.push(`/dashboard/officer/cases/${row.id}`)}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              {meta?.totalPages && meta.totalPages > 1 ? (
                <Pagination
                  page={meta.page ?? page}
                  totalPages={meta.totalPages}
                  total={meta.total}
                  limit={meta.limit}
                  onPageChange={setPage}
                  className="flex-1"
                />
              ) : (
                <p className="text-muted-foreground text-[11.5px]">
                  {meta?.total ?? 0} {meta?.total === 1 ? 'case' : 'cases'} in the queue
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Claiming is per-row, so it gets its own compact list above the table. */}
        {rows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-muted-foreground mb-2.5 text-[11px] font-semibold uppercase tracking-wide">
                Claim a case
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rows.slice(0, 4).map((row) => (
                  <Button
                    key={row.id}
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 px-2 text-[11.5px]"
                    onClick={() => handleClaim(row)}
                  >
                    <UserCheck className="h-3 w-3" />
                    {row.fdrNumber}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
