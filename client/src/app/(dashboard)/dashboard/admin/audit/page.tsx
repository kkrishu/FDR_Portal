'use client';

/**
 * Audit log.
 *
 * Every consequential action, newest first, with the tamper-evidence check. The
 * chain verification recomputes each row's hash from its contents plus the
 * previous row, so an edit anywhere in history is detectable.
 */

import * as React from 'react';
import { FileSearch, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi, useDynamicMutation } from '@/lib/hooks/use-api';
import { cn, formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  hash: string;
  previousHash: string | null;
  createdAt: string;
}

interface ChainResult {
  isValid: boolean;
  totalLogs: number;
  errors: Array<{ id: string; error: string }>;
}

const ACTIONS = [
  '',
  'FDR_SUBMITTED',
  'FDR_VERIFIED',
  'FDR_FLAGGED',
  'RELEASE_REQUESTED',
  'RULES_UPDATED',
];

export default function AdminAuditPage() {
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState('');

  const { data, meta, isLoading, errorMessage } = useApi<AuditRow[]>([
    '/audit',
    { page, limit: 20, ...(action ? { action } : {}) },
  ]);

  const [chain, setChain] = React.useState<ChainResult | null>(null);
  const verify = useDynamicMutation<ChainResult>('post', { errorMessage: false });

  const runVerify = async () => {
    try {
      const result = await verify.run('/audit/verify', {});
      if (result) setChain(result);
    } catch {
      setChain(null);
    }
  };

  const rows = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Audit logs"
          description="Append-only record of every consequential action in the portal."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runVerify()}
              disabled={verify.isMutating}
            >
              {verify.isMutating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 h-4 w-4" />
              )}
              Verify chain
            </Button>
          }
        />

        {chain && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3',
              chain.isValid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
            )}
          >
            {chain.isValid ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="text-[13px]">
              <p className="font-semibold">
                {chain.isValid ? 'Hash chain intact' : 'Hash chain compromised'}
              </p>
              <p className="mt-0.5 text-[12px]">
                {chain.isValid
                  ? `All ${chain.totalLogs} entries re-verified against their recorded hashes.`
                  : `${chain.errors.length} of ${chain.totalLogs} entries failed verification. The first failure is at ${chain.errors[0]?.id}.`}
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((option) => (
            <button
              key={option || 'all'}
              type="button"
              onClick={() => {
                setAction(option);
                setPage(1);
              }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                action === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {option ? option.replace(/_/g, ' ').toLowerCase() : 'All actions'}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={FileSearch}
                title="No audit entries"
                description="Nothing has been recorded for this filter yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b">
                      {['When', 'Actor', 'Action', 'Entity', 'IP'].map((heading, index) => (
                        <th
                          key={index}
                          className="text-muted-foreground pb-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em]"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className="animate-fade-in-up border-b last:border-0"
                        style={{ animationDelay: `${Math.min(index, 14) * 18}ms` }}
                      >
                        <td className="text-muted-foreground py-2.5 pr-3 text-[11.5px] tabular-nums">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="text-[12.5px] font-medium">{row.actorName}</p>
                          <p className="text-muted-foreground text-[10.5px]">
                            {row.actorRole.replace(/_/g, ' ').toLowerCase()}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium">
                            {row.action}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="text-[12px]">{row.entityType}</p>
                          <p className="text-muted-foreground font-mono text-[10px]">
                            {row.entityId.slice(0, 8)}…
                          </p>
                        </td>
                        <td className="text-muted-foreground py-2.5 font-mono text-[11px]">
                          {row.ipAddress ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
