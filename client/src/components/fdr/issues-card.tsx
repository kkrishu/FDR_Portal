'use client';

/**
 * Issues on a deposit — the flags a submission or a bank raised, each with a
 * lifecycle: the institution responds, an officer resolves or dismisses.
 *
 * Layout is columnar on purpose: severity and status sit on their own line so
 * the message never fights a chip for horizontal space, on any screen width.
 * Every message from the assessor already says what to do; the actions here are
 * how the answer travels back.
 */

import * as React from 'react';
import { CheckCircle2, Loader2, MessageSquareReply, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { UserRole } from '@fdr-portal/shared';
import { useAuthStore } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatDateTime } from '@/lib/utils';

export interface FlagRow {
  id: string;
  category: string;
  severity: string;
  message: string;
  createdAt: string;
  institutionResponse?: string | null;
  institutionRespondedAt?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}

interface IssuesCardProps {
  fdrId: string;
  flags: FlagRow[];
  onChanged: () => void;
}

export function IssuesCard({ fdrId, flags, onChanged }: IssuesCardProps) {
  const user = useAuthStore((state) => state.user);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;
  const isOfficer = role === 'OFFICER' || role === 'ADMIN';
  const isInstitution = role === 'INSTITUTION';

  const openCount = flags.filter((flag) => !flag.resolvedAt).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          {openCount > 0 ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {openCount} open {openCount === 1 ? 'issue' : 'issues'}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              All issues resolved
            </>
          )}
        </CardTitle>
        {isInstitution && openCount > 0 && (
          <p className="text-muted-foreground hidden text-[11px] sm:block">
            Respond below so a reviewer can close them
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {flags.map((flag) => (
          <FlagItem
            key={flag.id}
            fdrId={fdrId}
            flag={flag}
            isOfficer={isOfficer}
            isInstitution={isInstitution}
            onChanged={onChanged}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function FlagItem({
  fdrId,
  flag,
  isOfficer,
  isInstitution,
  onChanged,
}: {
  fdrId: string;
  flag: FlagRow;
  isOfficer: boolean;
  isInstitution: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [composing, setComposing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isResolved = Boolean(flag.resolvedAt);
  const hasResponse = Boolean(flag.institutionResponse);

  const submit = async (path: 'respond' | 'resolve' | 'dismiss') => {
    setBusy(true);
    setError(null);
    try {
      const { api } = await import('@/lib/api');
      await api.post(`/fdrs/${fdrId}/flags/${flag.id}/${path}`, { note: note.trim() });
      toast.success(
        path === 'respond'
          ? 'Response sent to the reviewing officer'
          : path === 'resolve'
            ? 'Flag resolved'
            : 'Flag dismissed as a false positive'
      );
      setNote('');
      setComposing(false);
      onChanged();
    } catch (caught: any) {
      setError(caught?.response?.error?.message ?? 'Could not submit — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        isResolved
          ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20'
          : flag.severity === 'BLOCK'
            ? 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20'
            : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20'
      )}
    >
      {/* Chips on their own line — never squeezed beside the message. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={flag.severity} severity />
        <StatusBadge
          status={isResolved ? 'RESOLVED' : hasResponse ? 'ACTIVE' : 'PENDING'}
          showDot={false}
          className={cn(
            isResolved
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : hasResponse
                ? 'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
                : undefined
          )}
        />
        <span className="text-muted-foreground ml-auto shrink-0 text-[10.5px] tabular-nums">
          {formatDateTime(flag.createdAt)}
        </span>
      </div>

      <p className="text-foreground mt-2 text-[13px] leading-relaxed">{flag.message}</p>

      {/* Institution's answer, visible to everyone. */}
      {hasResponse && (
        <div className="border-border/60 bg-card mt-2.5 rounded-lg border px-3 py-2">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide">
            <MessageSquareReply className="h-3 w-3" />
            Institution responded{' '}
            {flag.institutionRespondedAt && `· ${formatDateTime(flag.institutionRespondedAt)}`}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed">{flag.institutionResponse}</p>
        </div>
      )}

      {/* Officer's resolution. */}
      {isResolved && (
        <div className="mt-2.5 flex items-start gap-2 text-[12.5px] text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              Resolved{flag.resolutionNote?.startsWith('False positive') ? ' (false positive)' : ''}
            </p>
            {flag.resolutionNote && (
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                {flag.resolutionNote.replace(/^False positive: /, '')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action rows. */}
      {!isResolved && isInstitution && !composing && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setComposing(true)}>
          <MessageSquareReply className="mr-1.5 h-3.5 w-3.5" />
          {hasResponse ? 'Update your response' : 'Respond to this issue'}
        </Button>
      )}

      {!isResolved && composing && (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            placeholder="Explain what you corrected, or why this is not an issue…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
          />
          {error && (
            <p className="text-destructive text-[11.5px]" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void submit('respond')}
              disabled={busy || note.trim().length < 5}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Send response
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setComposing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!isResolved && isOfficer && (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            placeholder="Resolution note — what you checked and concluded…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            className={cn(!composing && 'hidden')}
          />
          {error && composing && (
            <p className="text-destructive text-[11.5px]" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void submit('resolve')}
              disabled={busy || note.trim().length < 5}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void submit('dismiss')}
              disabled={busy || note.trim().length < 5}
            >
              Dismiss as false positive
            </Button>
            {!composing && (
              <Button size="sm" variant="ghost" onClick={() => setComposing(true)}>
                Add note
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
