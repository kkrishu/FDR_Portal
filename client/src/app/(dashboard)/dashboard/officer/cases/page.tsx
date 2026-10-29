'use client';

/**
 * My cases.
 *
 * The officer's own assignments. "Assign to me" on the queue is what populates
 * this list, and unassigning a case returns it to the shared queue.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, Loader2, UserMinus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { FdrTable, type FdrRow } from '@/components/fdr/fdr-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';

export default function OfficerCasesPage() {
  const router = useRouter();
  const [page, setPage] = React.useState(1);

  const { data, meta, isLoading, errorMessage, refresh } = useApi<FdrRow[]>([
    '/officer/queue',
    { page, limit: 10, assignedToMe: true, sortBy: 'riskScore', sortOrder: 'desc' },
  ]);

  const release = useDynamicMutation('delete', {
    successMessage: 'Case returned to the queue',
    revalidate: ['/officer/queue', '/officer/cases', '/dashboard/summary'],
  });

  const rows = data ?? [];

  const handleRelease = async (row: FdrRow) => {
    await release.run(`/officer/fdrs/${row.id}/assign`).catch(() => undefined);
    await refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="My cases"
          description="Deposits you have claimed. Work them from here without hunting the shared queue."
          actions={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/officer/queue">Open queue</Link>
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
            {!isLoading && rows.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No cases assigned"
                description="Claim a case from the review queue and it will appear here."
                action={
                  <Button asChild size="sm">
                    <Link href="/dashboard/officer/queue">Go to review queue</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <FdrTable
                  rows={rows}
                  loading={isLoading}
                  detailBase="/dashboard/officer/cases"
                  detailKey="id"
                  showInstitution
                  showRisk
                  onRowClick={(row) => router.push(`/dashboard/officer/cases/${row.id}`)}
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <p className="text-muted-foreground text-[11.5px]">{meta?.total ?? 0} assigned</p>
                  {rows.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rows.slice(0, 3).map((row) => (
                        <Button
                          key={row.id}
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1.5 px-2 text-[11.5px]"
                          onClick={() => handleRelease(row)}
                        >
                          <UserMinus className="h-3 w-3" />
                          Release {row.fdrNumber}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </>
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
