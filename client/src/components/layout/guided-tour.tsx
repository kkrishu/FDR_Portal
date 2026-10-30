'use client';

/**
 * Guided tour.
 *
 * A spotlight walk-through of the pages that matter for the signed-in role.
 * The targeted element stays visible under a soft dim; the card explains what
 * it does and how to get there. Skippable at any point (Esc, ×, Skip), and the
 * choice is remembered per role so it never nags again. The onboarding
 * checklist stays — the tour is the map, the checklist is the to-do list.
 *
 * Targets that are not on screen (a mobile drawer, another role's page) are
 * skipped gracefully with a centered card instead of a spotlight.
 */

import * as React from 'react';
import { ArrowLeft, ArrowRight, Command, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@fdr-portal/shared';
import { useAuthStore } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface TourStep {
  /** CSS selector for the spotlight target; omit for a centered card. */
  selector?: string;
  title: string;
  body: string;
}

const STORAGE_PREFIX = 'fdr-tour-v1:';

function readState(role: string): 'unseen' | 'done' | 'skipped' {
  if (typeof window === 'undefined') return 'done';
  try {
    return (localStorage.getItem(STORAGE_PREFIX + role) as 'done' | 'skipped') ?? 'unseen';
  } catch {
    return 'done';
  }
}

function writeState(role: string, state: 'done' | 'skipped') {
  try {
    localStorage.setItem(STORAGE_PREFIX + role, state);
  } catch {
    /* ignore */
  }
}

const WELCOME: TourStep = {
  title: 'Welcome to FDR Portal',
  body: 'A 45-second walk through where everything lives. You can skip now and find it again later from the account menu.',
};

const DONE: TourStep = {
  title: 'You know your way around',
  body: 'The getting-started checklist on your overview tracks the rest — profile, first submission, and so on — and ticks itself off as you go.',
};

function stepsForRole(role: UserRole): TourStep[] {
  switch (role) {
    case 'INSTITUTION':
      return [
        {
          selector: '[data-tour="nav-fdrs"]',
          title: 'My FDRs',
          body: 'Every deposit you hold, with its live workflow state. Filter by status or search by number.',
        },
        {
          selector: '[data-tour="nav-submit"]',
          title: 'Submit FDR',
          body: 'A five-step wizard: bank details, deposit facts, joint holders, documents, review. Documents are hash-verified on upload.',
        },
        {
          selector: '[data-tour="nav-releases"]',
          title: 'Release requests',
          body: 'When a deposit is no longer needed, request its release here and track the approval chain.',
        },
        {
          selector: '[data-tour="nav-renewals"]',
          title: 'Renewals',
          body: 'Deposits approaching maturity, grouped by urgency — renew in one click before they lapse.',
        },
        {
          selector: '[data-tour="search"]',
          title: 'Search, anywhere',
          body: 'Press ⌘K to jump to any page or find a deposit by number. It also lives in the toolbar.',
        },
        {
          selector: '[data-tour="notifications"]',
          title: 'Notifications',
          body: 'Verification updates, flags, and approvals land here. The badge counts what is unread.',
        },
        {
          selector: '[data-tour="account"]',
          title: 'Your account',
          body: 'Profile and photo live under Profile; password, two-factor auth, and the theme are in Settings.',
        },
      ];
    case 'OFFICER':
      return [
        {
          selector: '[data-tour="nav-queue"]',
          title: 'Review queue',
          body: 'Every deposit awaiting a decision, ordered by risk so the dangerous ones surface first.',
        },
        {
          selector: '[data-tour="nav-cases"]',
          title: 'My cases',
          body: 'Claim a case from the queue and it moves here, so you work your own list.',
        },
        {
          selector: '[data-tour="nav-expiry"]',
          title: 'Expiry tracker',
          body: 'Held deposits grouped by how soon they mature — overdue, 7 days, 15, 30, 60.',
        },
        {
          selector: '[data-tour="search"]',
          title: 'Search, anywhere',
          body: '⌘K opens the palette: jump to pages or find any deposit instantly.',
        },
        {
          selector: '[data-tour="notifications"]',
          title: 'Notifications',
          body: 'New submissions, release requests, and bank answers arrive here.',
        },
      ];
    case 'ADMIN':
      return [
        {
          selector: '[data-tour="nav-users"]',
          title: 'Users',
          body: 'All accounts. Administrators can only be created here — public sign-up refuses the role.',
        },
        {
          selector: '[data-tour="nav-institutions"]',
          title: 'Institutions',
          body: 'The register of participating institutions and their deposits.',
        },
        {
          selector: '[data-tour="nav-directory"]',
          title: 'Bank directory',
          body: 'Banks and branches. A branch must exist here before deposits can be verified against it.',
        },
        {
          selector: '[data-tour="nav-rules"]',
          title: 'Rules',
          body: 'SLA hours, reminder days, and deposit limits — these drive every reminder and escalation.',
        },
        {
          selector: '[data-tour="nav-audit"]',
          title: 'Audit logs',
          body: 'Append-only and hash-chained. Run Verify chain to prove nothing was edited.',
        },
        {
          selector: '[data-tour="account"]',
          title: 'Your account',
          body: 'Profile, settings, and the replay-tour option live in this menu.',
        },
      ];
    case 'BANK_MANAGER':
    case 'NODAL_OFFICER':
      return [
        {
          selector: '[data-tour="nav-pending"]',
          title: 'Pending verification',
          body: 'Deposits your branch has been asked to confirm. The same requests also arrive by email.',
        },
        {
          selector: '[data-tour="nav-verify"]',
          title: 'Verify FDR',
          body: 'Open a request, confirm the particulars against your records, and approve by one-time code.',
        },
        {
          selector: '[data-tour="nav-history"]',
          title: 'History',
          body: 'Everything your branch has confirmed or flagged, newest first.',
        },
        {
          selector: '[data-tour="notifications"]',
          title: 'Notifications',
          body: 'New verification requests and reminders appear here.',
        },
      ];
    case 'AUDITOR':
      return [
        {
          selector: '[data-tour="nav-audit"]',
          title: 'Audit logs',
          body: 'Read-only, append-only, hash-chained. Verify the chain any time.',
        },
        {
          selector: '[data-tour="nav-reports"]',
          title: 'Reports',
          body: 'Turnaround and portfolio composition over any date range, exportable as CSV.',
        },
        {
          selector: '[data-tour="notifications"]',
          title: 'Notifications',
          body: 'System alerts that matter to assurance appear here.',
        },
      ];
    default:
      return [];
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function GuidedTour() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const role = (user?.role ?? 'INSTITUTION') as UserRole;

  const [state, setState] = React.useState<'unseen' | 'done' | 'skipped'>('done');
  const [stepIndex, setStepIndex] = React.useState(-1); // -1 = welcome card
  const [rect, setRect] = React.useState<Rect | null>(null);

  const steps = React.useMemo(() => stepsForRole(role), [role]);
  const active = state === 'unseen' && steps.length > 0;
  const current = stepIndex === -1 ? WELCOME : stepIndex < steps.length ? steps[stepIndex] : DONE;
  const isCentered = stepIndex === -1 || stepIndex >= steps.length || !rect;

  // Offer the tour once per role, after the dashboard has painted AND auth is loaded.
  React.useEffect(() => {
    if (isLoading) return;
    setState(readState(role));
  }, [role, isLoading]);

  React.useEffect(() => {
    if (isLoading || state !== 'unseen') return;
    const timer = setTimeout(() => setStepIndex(-1), 900);
    return () => clearTimeout(timer);
  }, [state, isLoading]);

  // Replay support from the account menu.
  React.useEffect(() => {
    const replay = () => {
      try {
        localStorage.removeItem(STORAGE_PREFIX + role);
      } catch {
        /* ignore */
      }
      if (isLoading) return;
      setState('unseen');
      setStepIndex(-1);
    };
    window.addEventListener('fdr:replay-tour', replay);
    return () => window.removeEventListener('fdr:replay-tour', replay);
  }, [role, isLoading]);

  const measure = React.useCallback(() => {
    if (stepIndex < 0 || stepIndex >= steps.length) {
      setRect(null);
      return;
    }
    const selector = steps[stepIndex].selector;
    const el = selector ? document.querySelector(selector) : null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // Hidden or box-less targets (e.g. a collapsed rail) measure 0×0 —
    // spotlighting that would paint a dot in the corner.
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight) {
      setRect(null);
      return;
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [stepIndex, steps]);

  React.useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const finish = React.useCallback(
    (as: 'done' | 'skipped') => {
      writeState(role, as);
      // Completing the tour is the onboarding checklist's second task; skipping
      // is not. Broadcast so an open checklist ticks without a reload.
      if (as === 'done') {
        try {
          localStorage.setItem(`fdr-tour-completed:${role}`, '1');
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event('fdr:tour-completed'));
      }
      setState(as);
      setStepIndex(-1);
    },
    [role]
  );

  const next = React.useCallback(() => {
    if (stepIndex >= steps.length) finish('done');
    else setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, finish]);

  const back = React.useCallback(() => {
    setStepIndex((i) => Math.max(-1, i - 1));
  }, []);

  // Keyboard: arrows navigate, Esc skips.
  React.useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish('skipped');
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, back, finish]);

  if (!active) return null;

  const total = steps.length + 2; // welcome + steps + done
  const position = stepIndex === -1 ? 0 : Math.min(stepIndex + 1, total - 1);
  const isDoneCard = stepIndex >= steps.length;

  // Spotlight geometry — clamped so the ring never leaves the screen.
  const pad = 8;
  const spot = rect
    ? {
        top: Math.max(pad, rect.top - pad),
        left: Math.max(pad, rect.left - pad),
        width: Math.min(rect.width + pad * 2, window.innerWidth - 2 * pad),
        height: rect.height + pad * 2,
      }
    : null;

  // Card placement: below the target by default, above when crowded, centered
  // as a fallback (welcome, done, or missing target on this screen).
  const cardStyle: React.CSSProperties = {};
  let cardPlacement = 'center';
  if (spot && !isCentered) {
    const cardWidth = Math.min(340, window.innerWidth - 24);
    const below = spot.top + spot.height + 12;
    const fitsBelow = below + 190 < window.innerHeight - 12;
    cardStyle.width = cardWidth;
    if (fitsBelow) {
      cardPlacement = 'targeted';
      cardStyle.top = below;
      cardStyle.left = Math.min(
        Math.max(12, spot.left + spot.width / 2 - cardWidth / 2),
        window.innerWidth - cardWidth - 12
      );
    } else {
      cardPlacement = 'targeted';
      cardStyle.top = Math.max(12, spot.top - 12 - 190);
      cardStyle.left = Math.min(
        Math.max(12, spot.left + spot.width / 2 - cardWidth / 2),
        window.innerWidth - cardWidth - 12
      );
    }
  }

  return (
    <div className="z-[100]" data-tour-overlay="">
      {/* Dimmer with a spotlight cut-out. A click does not advance — the tour
          is deliberately explicit, so a stray click never skips a step. */}
      {/* Backdrop. When a target is spotlighted, the ring's oversized
          box-shadow does the dimming and this layer is a silent click-blocker —
          a stray click must never skip a step. With no target (welcome, done,
          or a missing element on this screen) the backdrop itself dims and
          blurs so the centered card reads as a proper modal. */}
      <div
        aria-hidden
        className={cn(
          'animate-in fade-in fixed inset-0 z-[100] duration-300',
          spot ? 'bg-transparent' : 'bg-slate-950/60 backdrop-blur-md'
        )}
      />
      {/* Spotlight ring drawn as four panels around the target keeps the target
          fully interactive-looking without leaking clicks. */}
      {spot && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[100] rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] ring-2 ring-white/90 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
        />
      )}

      {/* Card */}
      <div
        role="dialog"
        aria-label={current.title}
        className={cn(
          'bg-background fixed z-[101] w-[calc(100vw-1.5rem)] max-w-[340px] rounded-2xl border p-5 shadow-[0_32px_90px_-20px_rgba(2,8,23,0.65)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'animate-in fade-in zoom-in-95 duration-300'
        )}
        style={
          cardPlacement === 'center'
            ? {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }
            : cardStyle
        }
      >
        <button
          type="button"
          onClick={() => finish('skipped')}
          className="text-muted-foreground hover:bg-accent hover:text-foreground absolute right-3 top-3 rounded-md p-1.5 transition-colors"
          aria-label="Skip tour"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {stepIndex === -1 && (
          <span className="bg-primary/10 text-primary mb-3 flex h-9 w-9 items-center justify-center rounded-xl">
            <Sparkles className="h-4 w-4" />
          </span>
        )}
        {stepIndex >= 0 && stepIndex < steps.length && (
          <span className="bg-primary/10 text-primary mb-3 flex h-9 w-9 items-center justify-center rounded-xl">
            <Command className="h-4 w-4" />
          </span>
        )}

        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{current.title}</h2>
        <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">{current.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: total }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  index === position ? 'bg-primary w-4' : 'bg-muted w-1.5'
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIndex > -1 && (
              <Button variant="ghost" size="sm" onClick={back} className="h-8">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={next} className="h-8">
              {stepIndex === -1
                ? 'Take the tour'
                : isDoneCard
                  ? 'Finish'
                  : stepIndex === steps.length - 1
                    ? 'Last stop'
                    : 'Next'}
              {stepIndex >= 0 && !isDoneCard && stepIndex < steps.length - 1 && (
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mt-3 text-[10.5px]">
          Step {position + 1} of {total} · Esc to skip
        </p>
      </div>
    </div>
  );
}
