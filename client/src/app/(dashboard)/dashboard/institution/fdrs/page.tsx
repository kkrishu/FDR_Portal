'use client';

/**
 * Institution FDR list.
 *
 * Server-side search, status filter, and pagination. Filters live in the URL so
 * a filtered view survives reload and can be linked from the overview tiles.
 */

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { FdrTable, type FdrRow } from '@/components/fdr/fdr-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { useApi } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'AWAITING_BANK_VERIFICATION', label: 'Awaiting bank' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'FLAGGED', label: 'Flagged' },
  { value: 'RELEASE_REQUESTED', label: 'Release' },
  { value: 'RELEASED', label: 'Released' },
];

function InstitutionFdrsView() {
  const searchParams = useSearchParams();

  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState(searchParams.get('status') ?? '');
  const [flagged, setFlagged] = React.useState(searchParams.get('flagged') === 'true');
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // A tile on the overview links here with ?status=… or ?flagged=true.
  React.useEffect(() => {
    setStatus(searchParams.get('status') ?? '');
    setFlagged(searchParams.get('flagged') === 'true');
    setPage(1);
  }, [searchParams]);

  const { data, meta, isLoading, errorMessage } = useApi<FdrRow[]>([
    '/fdrs',
    {
      page,
      limit: 10,
      ...(status ? { status } : {}),
      ...(flagged ? { flagged: true } : {}),
      ...(debouncedQuery ? { query: debouncedQuery } : {}),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
  ]);

  const rows = data ?? [];
  const hasFilters = Boolean(status || flagged || debouncedQuery);

  const clearFilters = () => {
    setStatus('');
    setFlagged(false);
    setQuery('');
    setPage(1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My FDRs"
          description="Every deposit your institution has recorded, with its current workflow state."
          actions={
            <Button asChild size="sm">
              <Link href="/dashboard/institution/submit">
                <Plus className="mr-1.5 h-4 w-4" />
                Submit FDR
              </Link>
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
                  placeholder="Search by FDR number or bank…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                variant={flagged ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setFlagged((value) => !value);
                  setPage(1);
                }}
                className="shrink-0"
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                {flagged ? 'Flagged only' : 'Only flagged'}
              </Button>
            </div>

            <div className="-mx-1 flex flex-wrap items-center gap-1.5 px-1">
              {STATUS_FILTERS.map((filter) => (
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
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-foreground rounded-full px-2 py-1 text-[11.5px] font-medium underline-offset-2 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            <FdrTable
              rows={rows}
              loading={isLoading}
              detailBase="/dashboard/institution/fdrs"
              detailKey="id"
              emptyTitle={hasFilters ? 'No deposits match those filters' : 'No deposits yet'}
              emptyDescription={
                hasFilters
                  ? 'Try a different status or clear the search.'
                  : 'Submit your first FDR to start tracking it here.'
              }
              emptyAction={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link href="/dashboard/institution/submit">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Submit FDR
                    </Link>
                  </Button>
                )
              }
            />

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

export default function InstitutionFdrsPage() {
  // `useSearchParams` requires a Suspense boundary for the route to prerender.
  return (
    <React.Suspense fallback={null}>
      <InstitutionFdrsView />
    </React.Suspense>
  );
}
