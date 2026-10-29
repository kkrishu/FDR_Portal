'use client';

/**
 * Overview dashboard.
 *
 * One component, four roles. The API scopes `/dashboard/summary` by role, so the
 * numbers here are whatever that user is entitled to see — an institution sees
 * its own deposits, an officer sees the national queue, a bank sees its branch.
 */

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { UserRole } from '@fdr-portal/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/lib/hooks/use-api';
import { OnboardingCard } from '@/components/layout/onboarding-card';
import { useAuthStore } from '@/lib/auth';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

interface Summary {
  role: string;
  scope: 'all' | 'tenant';
  counts: {
    active: number;
    drafts: number;
    pendingVerification: number;
    flagged: number;
    expiring30: number;
    expiring90: number;
    verified: number;
    released: number;
    assignedToMe: number;
    institutions: number;
    users: number;
  };
  amounts: { totalHeld: number };
  maturityBuckets: Array<{ label: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  recentFdrs: Array<{
    id: string;
    fdrNumber: string;
    bankName: string;
    branchName: string;
    amount: number;
    status: string;
    maturityDate: string;
    createdAt: string;
    riskScore: number;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    actorName: string;
    createdAt: string;
  }>;
}

const ROLE_COPY: Record<UserRole, { title: string; description: string }> = {
  INSTITUTION: {
    title: 'Your deposit portfolio',
    description: 'Every security deposit your institution holds with AICTE, in one place.',
  },
  OFFICER: {
    title: 'Review overview',
    description: 'What is waiting on you, what is at risk, and what is about to mature.',
  },
  ADMIN: {
    title: 'System overview',
    description: 'Portfolio health, workflow load, and recent activity across the portal.',
  },
  BANK_MANAGER: {
    title: 'Verification overview',
    description: 'Deposits your branch has been asked to confirm.',
  },
  NODAL_OFFICER: {
    title: 'Nodal overview',
    description: 'Deposits awaiting your confirmation and the state of the portfolio.',
  },
  AUDITOR: {
    title: 'Assurance overview',
    description: 'Read-only view of the full deposit book and its recent activity.',
  },
};

function roleDetailBase(role: UserRole): string {
  switch (role) {
    case 'INSTITUTION':
      return '/dashboard/institution/fdrs';
    case 'OFFICER':
    case 'ADMIN':
      return '/dashboard/officer/cases';
    case 'AUDITOR':
      return '/dashboard/officer/cases';
    default:
      return '/dashboard/bank/pending';
  }
}

export function OverviewDashboard() {
  const user = useAuthStore((state) => state.user);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;
  const copy = ROLE_COPY[role];
  const detailBase = roleDetailBase(role);

  const { data, isLoading, errorMessage } = useApi<Summary>('/dashboard/summary');

  const counts = data?.counts;
  const amounts = data?.amounts;
  const maxBucket = Math.max(1, ...(data?.maturityBuckets?.map((bucket) => bucket.count) ?? [1]));

  return (
    <div className="space-y-7">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <>
            {role === 'INSTITUTION' && (
              <Button asChild size="sm">
                <Link href="/dashboard/institution/submit">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Submit FDR
                </Link>
              </Button>
            )}
            {(role === 'OFFICER' || role === 'ADMIN') && (
              <Button asChild size="sm">
                <Link href="/dashboard/officer/queue">
                  <FileText className="mr-1.5 h-4 w-4" />
                  Open review queue
                </Link>
              </Button>
            )}
            {(role === 'BANK_MANAGER' || role === 'NODAL_OFFICER') && (
              <Button asChild size="sm">
                <Link href="/dashboard/bank/pending">
                  <Clock className="mr-1.5 h-4 w-4" />
                  Pending verification
                </Link>
              </Button>
            )}
          </>
        }
      />

      <OnboardingCard />

      {errorMessage && (
        <div className="border-destructive/25 bg-destructive/[0.06] text-destructive rounded-lg border px-4 py-3 text-sm">
          {errorMessage}
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active deposits"
          value={formatNumber(counts?.active ?? 0)}
          hint={amounts ? `${formatCurrency(amounts.totalHeld)} held` : undefined}
          icon={ShieldCheck}
          tone="info"
          loading={isLoading}
          href={`${detailBase}?status=VERIFIED`}
        />
        <StatCard
          label="Awaiting action"
          value={formatNumber(counts?.pendingVerification ?? 0)}
          hint={
            role === 'OFFICER'
              ? `${counts?.assignedToMe ?? 0} assigned to you`
              : 'In the workflow now'
          }
          icon={Clock}
          tone="warning"
          loading={isLoading}
          href={
            role === 'INSTITUTION'
              ? '/dashboard/institution/fdrs?status=SUBMITTED'
              : '/dashboard/officer/queue'
          }
        />
        <StatCard
          label="Expiring in 30 days"
          value={formatNumber(counts?.expiring30 ?? 0)}
          hint={`${counts?.expiring90 ?? 0} within 90 days`}
          icon={TrendingUp}
          tone={counts && counts.expiring30 > 0 ? 'warning' : 'default'}
          loading={isLoading}
          href={
            role === 'INSTITUTION' ? '/dashboard/institution/renewals' : '/dashboard/officer/expiry'
          }
        />
        <StatCard
          label="Flagged"
          value={formatNumber(counts?.flagged ?? 0)}
          hint={counts && counts.flagged > 0 ? 'Needs scrutiny' : 'Nothing flagged'}
          icon={AlertTriangle}
          tone={counts && counts.flagged > 0 ? 'critical' : 'positive'}
          loading={isLoading}
          href={
            role === 'INSTITUTION'
              ? '/dashboard/institution/fdrs?flagged=true'
              : '/dashboard/officer/queue'
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent deposits */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-[15px] font-semibold">Recent deposits</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link
                href={
                  role === 'INSTITUTION'
                    ? '/dashboard/institution/fdrs'
                    : '/dashboard/officer/queue'
                }
              >
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3 py-1">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 flex-1" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                ))}
              </div>
            ) : data?.recentFdrs.length ? (
              <ul className="divide-y">
                {data.recentFdrs.slice(0, 6).map((fdr) => (
                  <li key={fdr.id}>
                    <Link
                      href={`${detailBase}/${fdr.id}`}
                      className="hover:bg-muted/40 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[12.5px] font-medium">
                          {fdr.fdrNumber}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          {fdr.bankName} · {formatDate(fdr.maturityDate)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12.5px] font-medium tabular-nums">
                        {formatCurrency(fdr.amount)}
                      </span>
                      <StatusBadge status={fdr.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={FileText}
                title="No deposits yet"
                description={
                  role === 'INSTITUTION'
                    ? 'Submit your first FDR to get started.'
                    : 'Nothing has been submitted yet.'
                }
                action={
                  role === 'INSTITUTION' ? (
                    <Button asChild size="sm">
                      <Link href="/dashboard/institution/submit">Submit FDR</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Maturity distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-semibold">Maturity outlook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {isLoading
              ? [0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-9 w-full" />)
              : data?.maturityBuckets.map((bucket) => (
                  <div key={bucket.label} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="text-muted-foreground">{bucket.label}</span>
                      <span className="font-medium tabular-nums">{bucket.count}</span>
                    </div>
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}

            <div className="border-t pt-3">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="text-muted-foreground">Verified</p>
                  <p className="text-lg font-semibold tabular-nums">{counts?.verified ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Released</p>
                  <p className="text-lg font-semibold tabular-nums">{counts?.released ?? 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role-specific footer strip */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-semibold">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
            {role === 'INSTITUTION' && (
              <>
                <QuickAction href="/dashboard/institution/submit" icon={Plus} label="Submit FDR" />
                <QuickAction href="/dashboard/institution/fdrs" icon={FileText} label="My FDRs" />
                <QuickAction
                  href="/dashboard/institution/releases"
                  icon={ArrowLeftRight}
                  label="Release requests"
                />
                <QuickAction
                  href="/dashboard/institution/renewals"
                  icon={TrendingUp}
                  label="Renewals"
                />
              </>
            )}
            {(role === 'OFFICER' || role === 'ADMIN') && (
              <>
                <QuickAction href="/dashboard/officer/queue" icon={FileText} label="Review queue" />
                <QuickAction href="/dashboard/officer/cases" icon={CheckCircle2} label="My cases" />
                <QuickAction href="/dashboard/officer/expiry" icon={Clock} label="Expiry tracker" />
                <QuickAction
                  href={role === 'ADMIN' ? '/dashboard/admin/reports' : '/dashboard/officer/search'}
                  icon={role === 'ADMIN' ? BarChart3 : FileText}
                  label={role === 'ADMIN' ? 'Reports' : 'Search'}
                />
              </>
            )}
            {(role === 'BANK_MANAGER' || role === 'NODAL_OFFICER') && (
              <>
                <QuickAction href="/dashboard/bank/pending" icon={Clock} label="Pending" />
                <QuickAction href="/dashboard/bank/history" icon={CheckCircle2} label="History" />
                <QuickAction href="/dashboard/bank/verify" icon={ShieldCheck} label="Verify FDR" />
                <QuickAction
                  href="/dashboard/notifications"
                  icon={FileText}
                  label="Notifications"
                />
              </>
            )}
            {role === 'AUDITOR' && (
              <>
                <QuickAction href="/dashboard/admin/audit" icon={FileText} label="Audit logs" />
                <QuickAction href="/dashboard/admin/reports" icon={BarChart3} label="Reports" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-semibold">
              {data?.recentActivity.length ? 'Recent activity' : 'Portfolio mix'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-8 w-full" />
                ))}
              </div>
            ) : data?.recentActivity.length ? (
              <ul className="space-y-2.5">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5 text-[12px]">
                    <span className="bg-primary/10 text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                      {entry.actorName.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{entry.actorName}</span>{' '}
                        <span className="text-muted-foreground">
                          {entry.action.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {entry.entityType} · {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2">
                {data?.statusBreakdown.length ? (
                  data.statusBreakdown
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 6)
                    .map((entry) => (
                      <div key={entry.status} className="flex items-center justify-between">
                        <StatusBadge status={entry.status} />
                        <span className="text-[12px] font-medium tabular-nums">{entry.count}</span>
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground text-[12px]">No data to summarize yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin-only system line */}
      {(role === 'ADMIN' || role === 'AUDITOR') && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4 text-[12px]">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {counts?.users ?? 0} active users
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            {counts?.institutions ?? 0} institutions
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {formatCurrency(amounts?.totalHeld ?? 0)} under management
          </span>
        </div>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="border-border/70 hover:border-border hover:bg-accent/50 group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] font-medium transition-all duration-200 active:scale-[0.985]"
    >
      <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{label}</span>
      <ArrowRight className="text-muted-foreground/40 ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}
