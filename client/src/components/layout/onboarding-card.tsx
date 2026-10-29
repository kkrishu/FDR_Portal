'use client';

/**
 * First-run onboarding.
 *
 * A role-specific checklist of the three actions that make the portal useful,
 * which tracks real state rather than page visits: "submit your first FDR"
 * ticks only when an FDR exists. Dismissing is remembered per role, and the
 * card never nags again once every item is complete.
 */

import * as React from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import type { UserRole } from '@fdr-portal/shared';
import { useAuthStore } from '@/lib/auth';
import { useApi } from '@/lib/hooks/use-api';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

const STORAGE_KEY = 'fdr-onboarding-v1';
const TOUR_DONE_PREFIX = 'fdr-tour-completed:';

function readDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeDismissed(roles: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  } catch {
    /* storage unavailable; the card simply reappears next visit */
  }
}

const COPY: Record<UserRole, { title: string; blurb: string }> = {
  INSTITUTION: {
    title: 'Get started with your portfolio',
    blurb: 'Three steps and your deposits are tracked end to end.',
  },
  OFFICER: {
    title: 'Get started with reviews',
    blurb: 'Claim a case, work the queue, and keep an eye on maturities.',
  },
  ADMIN: {
    title: 'Get started with the console',
    blurb: 'A few things worth checking on a fresh workspace.',
  },
  BANK_MANAGER: {
    title: 'Get started with verification',
    blurb: 'Requests arrive here and by email to your branch.',
  },
  NODAL_OFFICER: {
    title: 'Get started with verification',
    blurb: 'Requests arrive here and by email to your branch.',
  },
  AUDITOR: {
    title: 'Get started with assurance',
    blurb: 'Everything is read-only — start with the audit trail.',
  },
};

export function OnboardingCard() {
  const user = useAuthStore((state) => state.user);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;

  const [dismissed, setDismissed] = React.useState<string[] | null>(null);
  const [tourCompleted, setTourCompleted] = React.useState(false);
  React.useEffect(() => {
    setDismissed(readDismissed());
    try {
      setTourCompleted(localStorage.getItem(TOUR_DONE_PREFIX + role) === '1');
    } catch {
      /* ignore */
    }
    const onTourDone = () => setTourCompleted(true);
    window.addEventListener('fdr:tour-completed', onTourDone);
    return () => window.removeEventListener('fdr:tour-completed', onTourDone);
  }, [role]);

  const launchTour = () => window.dispatchEvent(new Event('fdr:replay-tour'));

  // Everything the checklist needs comes from one summary call, so the ticks
  // reflect reality and update as the user works.
  const { data } = useApi<{
    counts: { active: number; drafts: number; assignedToMe: number; users: number };
  }>('/dashboard/summary');
  const { data: institution } = useApi<{ address: string; city: string }>(
    role === 'INSTITUTION' && user?.institutionId
      ? `/institutions/${user.institutionId}/profile`
      : null
  );

  const tasks: Task[] = React.useMemo(() => {
    switch (role) {
      case 'INSTITUTION': {
        const hasDeposits = (data?.counts.active ?? 0) + (data?.counts.drafts ?? 0) > 0;
        const profileFilled =
          Boolean(institution) &&
          institution!.address !== 'To be updated' &&
          institution!.city !== 'To be updated';
        // Profile first: submissions carry the institution's details, so a
        // filled profile is the natural step one. Filing comes last.
        return [
          {
            id: 'profile',
            label: 'Complete your institution profile',
            description: 'Name, address, and contacts appear on every submission.',
            href: '/dashboard/profile',
            done: profileFilled,
          },
          {
            id: 'tour',
            label: 'Take the guided tour',
            description: 'A one-minute walkthrough of where everything lives.',
            href: '/dashboard/institution',
            done: tourCompleted,
          },
          {
            id: 'submit',
            label: 'Submit your first FDR',
            description: 'Create a draft, attach the certificate, and send it for verification.',
            href: '/dashboard/institution/submit',
            done: hasDeposits,
          },
        ];
      }
      case 'OFFICER':
        return [
          {
            id: 'queue',
            label: 'Open the review queue',
            description: 'Deposits waiting for a decision, highest risk first.',
            href: '/dashboard/officer/queue',
            done: false,
          },
          {
            id: 'claim',
            label: 'Claim a case',
            description: 'Assigned cases move to “My cases” so you can work them in order.',
            href: '/dashboard/officer/queue',
            done: (data?.counts.assignedToMe ?? 0) > 0,
          },
          {
            id: 'expiry',
            label: 'Check the expiry tracker',
            description: 'See what matures soon, grouped by urgency.',
            href: '/dashboard/officer/expiry',
            done: false,
          },
        ];
      case 'ADMIN':
        return [
          {
            id: 'users',
            label: 'Review user accounts',
            description: 'Administrators can only be created here, not by public sign-up.',
            href: '/dashboard/admin/users',
            done: (data?.counts.users ?? 0) > 1,
          },
          {
            id: 'audit',
            label: 'Verify the audit chain',
            description: 'Recomputes every entry’s hash to prove the log is untouched.',
            href: '/dashboard/admin/audit',
            done: false,
          },
          {
            id: 'rules',
            label: 'Check workflow rules',
            description: 'SLA hours and reminder days drive reminders and escalations.',
            href: '/dashboard/admin/rules',
            done: false,
          },
        ];
      case 'BANK_MANAGER':
      case 'NODAL_OFFICER':
        return [
          {
            id: 'pending',
            label: 'Open pending verifications',
            description: 'Deposits your branch has been asked to confirm.',
            href: '/dashboard/bank/pending',
            done: false,
          },
          {
            id: 'history',
            label: 'Review verification history',
            description: 'Everything your branch has already confirmed or flagged.',
            href: '/dashboard/bank/history',
            done: false,
          },
        ];
      case 'AUDITOR':
        return [
          {
            id: 'chain',
            label: 'Verify the audit chain',
            description: 'Proves the append-only log has not been altered.',
            href: '/dashboard/admin/audit',
            done: false,
          },
          {
            id: 'reports',
            label: 'Review reports',
            description: 'Turnaround and portfolio composition for a date range.',
            href: '/dashboard/admin/reports',
            done: false,
          },
        ];
      default:
        return [];
    }
  }, [role, data, institution, tourCompleted]);

  const visible =
    dismissed !== null &&
    !dismissed.includes(role) &&
    tasks.length > 0 &&
    !tasks.every((t) => t.done);

  if (!visible) return null;

  const copy = COPY[role];
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <section className="border-primary/25 from-primary/[0.05] relative overflow-hidden rounded-xl border bg-gradient-to-b to-transparent">
      <button
        type="button"
        onClick={() => {
          const next = [...(dismissed ?? []), role];
          writeDismissed(next);
          setDismissed(next);
        }}
        className="text-muted-foreground hover:bg-accent hover:text-foreground absolute right-2 top-2 rounded-md p-1.5 transition-colors"
        aria-label="Dismiss getting started"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pr-6">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{copy.title}</h2>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {doneCount}/{tasks.length} done
          </p>
        </div>
        <p className="text-muted-foreground mt-0.5 text-[12.5px]">{copy.blurb}</p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {tasks.map((task) => {
            const body = (
              <>
                <span
                  className={cn(
                    'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border',
                    task.done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-border bg-background'
                  )}
                >
                  {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-[12.5px] font-medium leading-snug',
                      task.done && 'text-muted-foreground line-through'
                    )}
                  >
                    {task.label}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px] leading-relaxed">
                    {task.description}
                  </span>
                </span>
              </>
            );

            return (
              <li key={task.id}>
                {task.done ? (
                  <div className="flex gap-2.5 rounded-lg border border-transparent px-3 py-2.5 opacity-70">
                    {body}
                  </div>
                ) : (
                  <Link
                    href={task.href}
                    onClick={
                      task.id === 'tour'
                        ? (event) => {
                            event.preventDefault();
                            launchTour();
                          }
                        : undefined
                    }
                    className="hover:border-primary/40 hover:bg-accent/40 border-border/70 bg-card/60 flex gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
