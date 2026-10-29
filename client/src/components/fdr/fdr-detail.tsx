'use client';

/**
 * FDR detail.
 *
 * One view for every role: institution, officer, administrator and auditor all
 * look at the same record, and actions are gated by permission rather than
 * duplicated per route. Everything shown comes from `GET /fdrs/:id`, which
 * already includes joint holders, lien, documents, flags, timeline and the
 * verification result.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { UserRole } from '@fdr-portal/shared';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useApi, useApiMutation } from '@/lib/hooks/use-api';
import { IssuesCard } from '@/components/fdr/issues-card';
import { useAuthStore } from '@/lib/auth';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

interface DetailDocument {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  uploadedAt: string;
}

interface TimelineEntry {
  id: string;
  status: string;
  action: string;
  description: string | null;
  actorName: string;
  actorRole: string;
  createdAt: string;
}

interface FdrDetail {
  id: string;
  fdrNumber: string;
  bankName: string;
  branchName: string;
  ifscCode: string;
  amount: number;
  issueDate: string;
  maturityDate: string;
  interestRate: number | null;
  interestAmount: number | null;
  status: string;
  riskScore: number;
  assuranceLevel: string | null;
  createdAt: string;
  assignedTo: string | null;
  releasedAt: string | null;
  institution: { id: string; name: string; code: string; city?: string; state?: string };
  jointHolders: Array<{
    id: string;
    name: string;
    pan: string;
    isAICTE: boolean;
    percentage: number;
  }>;
  lienDetails: {
    lienHolderName: string;
    lienHolderPAN: string;
    lienAmount: number;
    lienStartDate: string;
    lienEndDate: string | null;
  } | null;
  documents: DetailDocument[];
  flags: Array<{
    id: string;
    category: string;
    severity: string;
    message: string;
    createdAt: string;
    institutionResponse?: string | null;
    institutionRespondedAt?: string | null;
    resolvedAt?: string | null;
    resolutionNote?: string | null;
  }>;
  timeline: TimelineEntry[];
  verificationResult: {
    verifiedAt: string;
    verifiedByRole: string;
    amountMatch: boolean;
    issueDateMatch: boolean;
    maturityDateMatch: boolean;
    fdrNumberMatch: boolean;
    jointHoldersMatch: boolean;
    lienMatch: boolean;
    remarks: string | null;
    assuranceLevel: string;
  } | null;
  createdByUser?: { id: string; name: string; email: string };
}

/** Readable names for the timeline actions; unknown actions fall back to a
 *  de-snake-cased string so nothing ever renders as a raw enum. */
const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Deposit created',
  UPDATED: 'Draft updated',
  SUBMITTED: 'Submitted for verification',
  VERIFICATION_REQUESTED: 'Bank verification requested',
  BANK_VERIFIED: 'Bank confirmed details',
  BANK_FLAGGED: 'Bank reported a discrepancy',
  VERIFIED: 'Verified by reviewing officer',
  FLAGGED: 'Flagged for scrutiny',
  MANUAL_VERIFIED: 'Verified manually',
  UNDER_REVIEW: 'Moved to review',
  EXPIRED: 'Deposit matured',
  RENEWED: 'Renewed',
  RELEASE_REQUESTED: 'Release requested',
  RELEASE_RECOMMENDED: 'Release recommended',
  RELEASE_APPROVED: 'Release approved',
  RELEASE_REJECTED: 'Release rejected',
  RELEASED: 'Released to institution',
  ASSIGNED: 'Case assigned',
  UNASSIGNED: 'Case returned to queue',
  DOCUMENT_REQUESTED: 'Documents requested',
  NODAL_VERIFIED: 'Confirmed by nodal officer',
  NODAL_FLAGGED: 'Flagged by nodal officer',
};

const DOC_TYPE_LABEL: Record<string, string> = {
  FDR_CERTIFICATE: 'FDR certificate',
  BOARD_RESOLUTION: 'Board resolution',
  LIEN_LETTER: 'Lien letter',
  OTHER: 'Supporting document',
};

/** Statuses where an institution may still request release. */
const RELEASABLE = ['VERIFIED', 'MANUAL_VERIFIED'];

/** Statuses where a renewal makes sense. */
const RENEWABLE = ['VERIFIED', 'MANUAL_VERIFIED', 'EXPIRED', 'RENEWAL_PENDING'];

export function FdrDetailView({ fdrId, backHref }: { fdrId: string; backHref: string }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;

  const { data: fdr, isLoading, errorMessage, refresh } = useApi<FdrDetail>(`/fdrs/${fdrId}`);

  const [releaseOpen, setReleaseOpen] = React.useState(false);
  const [releaseReason, setReleaseReason] = React.useState('');

  const releaseMutation = useApiMutation(`/fdrs/${fdrId}/release-requests`, 'post', {
    successMessage: 'Release requested',
    revalidate: [`/fdrs/${fdrId}`, '/fdrs', '/dashboard/summary'],
    onSuccess: () => {
      setReleaseOpen(false);
      setReleaseReason('');
      void refresh();
    },
  });

  const renewMutation = useApiMutation(`/fdrs/${fdrId}/renew`, 'post', {
    successMessage: 'Renewal draft created',
    revalidate: ['/fdrs', '/dashboard/summary'],
    onSuccess: (created: any) => {
      if (created?.id) router.push(`/dashboard/institution/fdrs/${created.id}`);
    },
  });

  if (isLoading) return <FdrDetailSkeleton backHref={backHref} />;

  if (errorMessage || !fdr) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-5">
            <Link href={backHref}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Link>
          </Button>
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Could not load this deposit</AlertTitle>
            <AlertDescription>{errorMessage ?? 'The record was not found.'}</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const daysToMaturity = Math.ceil(
    (new Date(fdr.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const canRelease = role === 'INSTITUTION' && RELEASABLE.includes(fdr.status);
  const canRenew = role === 'INSTITUTION' && RENEWABLE.includes(fdr.status);
  const isOfficer = role === 'OFFICER' || role === 'ADMIN';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
            <Link href={backHref}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Link>
          </Button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Fixed Deposit Receipt
                </p>
                <StatusBadge status={fdr.status} />
              </div>
              <h1 className="mt-1.5 font-mono text-2xl font-semibold tracking-tight">
                {fdr.fdrNumber}
              </h1>
              <p className="text-muted-foreground mt-1 text-[13px]">
                {fdr.institution.name} · {fdr.bankName}, {fdr.branchName}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isOfficer && (
                <Button asChild size="sm">
                  <Link href={`/dashboard/officer/cases/${fdr.id}`}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Review case
                  </Link>
                </Button>
              )}

              {canRenew && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => renewMutation.run({})}
                  disabled={renewMutation.isMutating}
                >
                  {renewMutation.isMutating ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                  )}
                  Renew
                </Button>
              )}

              {canRelease && (
                <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <ArrowLeftRight className="mr-1.5 h-4 w-4" />
                      Request release
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request release of {fdr.fdrNumber}</DialogTitle>
                      <DialogDescription>
                        This starts the release workflow. A reviewing officer will assess the
                        request and an administrator approves it.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                      <Label htmlFor="release-reason">Reason</Label>
                      <Textarea
                        id="release-reason"
                        placeholder="Explain why the deposit should be released…"
                        value={releaseReason}
                        onChange={(event) => setReleaseReason(event.target.value)}
                        rows={4}
                      />
                      {releaseMutation.errorMessage && (
                        <p className="text-destructive text-xs">{releaseMutation.errorMessage}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setReleaseOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => releaseMutation.run({ reason: releaseReason })}
                        disabled={releaseReason.trim().length < 10 || releaseMutation.isMutating}
                        loading={releaseMutation.isMutating}
                      >
                        Submit request
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>

        {/* Key facts */}
        <div className="bg-border/60 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
          <Fact icon={Banknote} label="Amount" value={formatCurrency(fdr.amount)} />
          <Fact
            icon={Calendar}
            label="Issued"
            value={formatDate(fdr.issueDate)}
            hint={
              fdr.interestRate
                ? `${fdr.interestRate}% p.a.${fdr.interestAmount ? ` · ${formatCurrency(fdr.interestAmount)} interest` : ''}`
                : undefined
            }
          />
          <Fact
            icon={Clock}
            label="Matures"
            value={formatDate(fdr.maturityDate)}
            hint={
              daysToMaturity < 0
                ? `${Math.abs(daysToMaturity)} days overdue`
                : `${daysToMaturity} days remaining`
            }
            tone={daysToMaturity <= 30 ? 'warning' : undefined}
          />
          <Fact icon={Building2} label="Branch" value={fdr.ifscCode} hint={fdr.branchName} />
        </div>

        {fdr.flags.length > 0 && (
          <IssuesCard fdrId={fdr.id} flags={fdr.flags} onChanged={() => void refresh()} />
        )}

        <Tabs defaultValue="timeline">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="timeline">
                <History className="mr-1.5 h-3.5 w-3.5" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Documents ({fdr.documents.length})
              </TabsTrigger>
              <TabsTrigger value="parties">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Holders & lien
              </TabsTrigger>
              <TabsTrigger value="verification">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Verification
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="timeline" className="mt-4">
            <Card>
              <CardContent className="pt-5">
                {fdr.timeline.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-4 text-[11.5px]">
                      Read from top to bottom — each entry is what happened next.
                    </p>
                    {/* Chronological: the API returns newest first, so the oldest
                        renders at the top and the story reads in order. */}
                    <ol className="relative">
                      {[...fdr.timeline].reverse().map((entry, index, ordered) => {
                        const isLatest = index === ordered.length - 1;
                        return (
                          <li key={entry.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                            {/* Rail joins every step; the dot marks each one. */}
                            {index < ordered.length - 1 && (
                              <span
                                aria-hidden
                                className="bg-border absolute left-[7px] top-4 h-full w-px"
                              />
                            )}
                            <span
                              className={cn(
                                'relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2',
                                isLatest
                                  ? 'border-primary bg-primary'
                                  : 'border-border bg-background'
                              )}
                            >
                              {isLatest && (
                                <span className="bg-primary/20 animate-pulse-soft absolute -inset-1 -z-10 rounded-full" />
                              )}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p
                                  className={cn(
                                    'text-[13px] leading-snug',
                                    isLatest ? 'font-semibold' : 'font-medium'
                                  )}
                                >
                                  {ACTION_LABELS[entry.action] ??
                                    entry.action.replace(/_/g, ' ').toLowerCase()}
                                  {isLatest && (
                                    <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide">
                                      Latest
                                    </span>
                                  )}
                                </p>
                                <time className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                                  {formatDateTime(entry.createdAt)}
                                </time>
                              </div>
                              {entry.description &&
                                entry.description !==
                                  (ACTION_LABELS[entry.action] ?? '').toLowerCase() && (
                                  <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
                                    {entry.description}
                                  </p>
                                )}
                              <p className="text-muted-foreground mt-1 text-[11px]">
                                {entry.actorName} ·{' '}
                                {entry.actorRole.replace(/_/g, ' ').toLowerCase()}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardContent className="pt-5">
                {fdr.documents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No documents attached.</p>
                ) : (
                  <ul className="divide-y">
                    {fdr.documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          <FileText className="text-muted-foreground h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{document.fileName}</p>
                          <p className="text-muted-foreground text-[11px]">
                            {DOC_TYPE_LABEL[document.type] ?? document.type} ·{' '}
                            {(document.fileSize / 1024).toFixed(0)} KB ·{' '}
                            <span className="font-mono">{document.fileHash.slice(0, 12)}…</span>
                          </p>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="shrink-0">
                          <a
                            href={document.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Download
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parties" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-[14px] font-semibold">Joint holders</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {fdr.jointHolders.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No holders recorded.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {fdr.jointHolders.map((holder) => (
                        <li key={holder.id} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium">{holder.name}</p>
                            <p className="text-muted-foreground font-mono text-[11px]">
                              {holder.pan}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[12.5px] font-semibold tabular-nums">
                              {holder.percentage}%
                            </p>
                            {holder.isAICTE && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                AICTE
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-[14px] font-semibold">
                    <Lock className="h-3.5 w-3.5" />
                    Lien
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {fdr.lienDetails ? (
                    <dl className="space-y-2 text-[12.5px]">
                      <Row label="Holder" value={fdr.lienDetails.lienHolderName} />
                      <Row label="PAN" value={fdr.lienDetails.lienHolderPAN} mono />
                      <Row label="Amount" value={formatCurrency(fdr.lienDetails.lienAmount)} />
                      <Row label="From" value={formatDate(fdr.lienDetails.lienStartDate)} />
                      <Row
                        label="Until"
                        value={
                          fdr.lienDetails.lienEndDate
                            ? formatDate(fdr.lienDetails.lienEndDate)
                            : 'Open'
                        }
                      />
                    </dl>
                  ) : (
                    <p className="text-muted-foreground text-sm">No lien recorded.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="verification" className="mt-4">
            <Card>
              <CardContent className="pt-5">
                {fdr.verificationResult ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium">Bank confirmation</p>
                        <p className="text-muted-foreground text-[11.5px]">
                          {formatDateTime(fdr.verificationResult.verifiedAt)} ·{' '}
                          {fdr.verificationResult.verifiedByRole.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      </div>
                      <StatusBadge
                        status={
                          fdr.verificationResult.assuranceLevel === 'HIGH'
                            ? 'VERIFIED'
                            : 'MANUAL_VERIFIED'
                        }
                      />
                    </div>
                    <Separator />
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {[
                        ['Amount', fdr.verificationResult.amountMatch],
                        ['Issue date', fdr.verificationResult.issueDateMatch],
                        ['Maturity date', fdr.verificationResult.maturityDateMatch],
                        ['FDR number', fdr.verificationResult.fdrNumberMatch],
                        ['Joint holders', fdr.verificationResult.jointHoldersMatch],
                        ['Lien', fdr.verificationResult.lienMatch],
                      ].map(([label, matched]) => (
                        <li key={label as string} className="flex items-center gap-2 text-[12.5px]">
                          {matched ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          )}
                          <span className={matched ? '' : 'text-muted-foreground'}>
                            {label as string}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {fdr.verificationResult.remarks && (
                      <p className="bg-muted/60 rounded-lg px-3 py-2 text-[12px] leading-relaxed">
                        {fdr.verificationResult.remarks}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No bank verification has been recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning';
}) {
  return (
    <div className="bg-card px-4 py-3.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.06em]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p
        className={cn(
          'mt-1 text-[14px] font-semibold',
          tone === 'warning' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium', mono && 'font-mono text-[11.5px]')}>{value}</dd>
    </div>
  );
}

function FdrDetailSkeleton({ backHref }: { backHref: string }) {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back
          </Link>
        </Button>
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="bg-card space-y-2 px-4 py-3.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </DashboardLayout>
  );
}
