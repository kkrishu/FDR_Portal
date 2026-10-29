'use client';

/**
 * Reports.
 *
 * Turnaround, workload, and portfolio composition for a date range, plus a CSV
 * export of what is on screen. Every number comes from `/admin/analytics` or
 * `/dashboard/summary` — nothing is computed in the browser from a sample.
 */

import * as React from 'react';
import { BarChart3, Download, Loader2, TrendingUp } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency } from '@/lib/utils';

interface Analytics {
  totalFDRs?: number;
  avgTurnaroundHours?: number;
  officerWorkload?: Array<{
    officerId: string;
    officerName: string;
    assigned: number;
    completed: number;
    avgTurnaround: number;
  }>;
  statusBreakdown?: Array<{ status: string; count: number }>;
  [key: string]: unknown;
}

interface Summary {
  counts: Record<string, number>;
  amounts: { totalHeld: number };
  maturityBuckets: Array<{ label: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const [from, setFrom] = React.useState(isoDaysAgo(90));
  const [to, setTo] = React.useState(isoDaysAgo(0));

  const { data: analytics, isLoading } = useApi<Analytics>([
    '/admin/analytics',
    { dateFrom: new Date(from).toISOString(), dateTo: new Date(to).toISOString() },
  ]);

  const { data: summary } = useApi<Summary>('/dashboard/summary');

  const statusRows = summary?.statusBreakdown ?? [];

  /** Builds a CSV from the status composition table. */
  const exportCsv = () => {
    const lines = [
      'Status,Count',
      ...statusRows.map((row) => `${row.status},${row.count}`),
      '',
      'Officer,Assigned,Completed,Avg turnaround (hours)',
      ...(analytics?.officerWorkload ?? []).map(
        (officer) =>
          `"${officer.officerName}",${officer.assigned},${officer.completed},${officer.avgTurnaround.toFixed(1)}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fdr-report-${from}-to-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const maxStatus = Math.max(1, ...statusRows.map((row) => row.count));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Turnaround, officer workload, and portfolio composition for a date range."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              disabled={statusRows.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          }
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-from" className="text-[12px]">
              From
            </Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-to" className="text-[12px]">
              To
            </Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="flex gap-1.5 pb-0.5">
            {[
              { label: '30 days', days: 30 },
              { label: '90 days', days: 90 },
              { label: '1 year', days: 365 },
            ].map((preset) => (
              <Button
                key={preset.days}
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setFrom(isoDaysAgo(preset.days));
                  setTo(isoDaysAgo(0));
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            [0, 1, 2, 3].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-2 py-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-20" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-[11.5px] font-medium">
                    Avg verification turnaround
                  </p>
                  <p className="mt-1 text-[24px] font-semibold tabular-nums">
                    {analytics?.avgTurnaroundHours
                      ? `${analytics.avgTurnaroundHours.toFixed(1)}h`
                      : '—'}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    Submission to officer decision
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-[11.5px] font-medium">Active officers</p>
                  <p className="mt-1 text-[24px] font-semibold tabular-nums">
                    {analytics?.officerWorkload?.length ?? 0}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">In the range</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-[11.5px] font-medium">
                    Total under management
                  </p>
                  <p className="mt-1 text-[24px] font-semibold tabular-nums">
                    {formatCurrency(summary?.amounts.totalHeld ?? 0)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">Across all deposits</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-muted-foreground text-[11.5px] font-medium">Verified</p>
                  <p className="mt-1 text-[24px] font-semibold tabular-nums">
                    {summary?.counts.verified ?? 0}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    {summary?.counts.released ?? 0} released
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Officer workload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                <TrendingUp className="h-4 w-4" />
                Officer workload
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((key) => (
                    <Skeleton key={key} className="h-9 w-full" />
                  ))}
                </div>
              ) : (analytics?.officerWorkload ?? []).length === 0 ? (
                <p className="text-muted-foreground py-4 text-[12.5px]">
                  No officer decisions recorded in this range.
                </p>
              ) : (
                <div className="space-y-3">
                  {(analytics?.officerWorkload ?? []).map((officer) => (
                    <div key={officer.officerId} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                        <span className="truncate font-medium">{officer.officerName}</span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {officer.completed}/{officer.assigned} ·{' '}
                          {officer.avgTurnaround.toFixed(0)}h avg
                        </span>
                      </div>
                      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${
                              officer.assigned === 0
                                ? 0
                                : (officer.completed / Math.max(officer.assigned, 1)) * 100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status composition */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                <BarChart3 className="h-4 w-4" />
                Portfolio composition
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {statusRows.length === 0 ? (
                <p className="text-muted-foreground py-4 text-[12.5px]">No deposits yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {statusRows
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((row) => (
                      <div key={row.status} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-[11.5px]">
                          {row.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-700"
                            style={{ width: `${(row.count / maxStatus) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[11.5px] font-medium tabular-nums">
                          {row.count}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
