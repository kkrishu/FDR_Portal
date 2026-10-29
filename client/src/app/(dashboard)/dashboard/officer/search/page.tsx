'use client';

/**
 * FDR search.
 *
 * Full-corpus lookup for officers and administrators: matches the FDR number or
 * bank name server-side and pages through results.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { FdrTable, type FdrRow } from '@/components/fdr/fdr-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';

const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'FLAGGED', label: 'Flagged' },
  { value: 'RELEASE_REQUESTED', label: 'Release' },
  { value: 'RELEASED', label: 'Released' },
];

export default function OfficerSearchPage() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debounced.length >= 2;

  const { data, meta, isLoading, errorMessage } = useApi<FdrRow[]>(
    enabled
      ? ['/officer/search', { q: debounced, page, limit: 10, ...(status ? { status } : {}) }]
      : null
  );

  const rows = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Search"
          description="Look up any deposit across every institution by number or bank."
        />

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                autoFocus
                placeholder="Type an FDR number or bank name…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 pl-10 text-[14px]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((filter) => (
                <button
                  key={filter.value || 'any'}
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

            {!enabled ? (
              <EmptyState
                compact
                icon={Search}
                title="Start typing"
                description="Enter at least two characters to search the portfolio."
              />
            ) : isLoading ? (
              <FdrTable rows={[]} loading detailBase="/dashboard/officer/cases" />
            ) : rows.length === 0 ? (
              <EmptyState
                compact
                icon={Search}
                title={`No matches for “${debounced}”`}
                description="Check the FDR number, or try the bank name instead."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      setStatus('');
                    }}
                  >
                    Clear search
                  </Button>
                }
              />
            ) : (
              <FdrTable
                rows={rows}
                detailBase="/dashboard/officer/cases"
                detailKey="id"
                showInstitution
                showRisk
                onRowClick={(row) => router.push(`/dashboard/officer/cases/${row.id}`)}
              />
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
