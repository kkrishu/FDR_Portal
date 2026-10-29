import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  FileCheck2,
  Fingerprint,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo, LogoMark } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { GoToTop } from '@/components/layout/go-to-top';

/**
 * Marketing surface. Its visitors are institution staff, bank branch officers,
 * and AICTE reviewers who were told to use the portal — so it answers three
 * questions in order: what is it, can the record be trusted, and where do I
 * sign in. No feature catalogue: the same story is not retold twice.
 */

const workflow = [
  {
    step: '01',
    title: 'Institution submits',
    body: 'The deposit is recorded once — amount, dates, holders, and the signed receipt — and sent for verification.',
    icon: FileCheck2,
  },
  {
    step: '02',
    title: 'Bank confirms',
    body: 'The branch receives a link that expires, checks the details against its own records, and approves by one-time code.',
    icon: Banknote,
  },
  {
    step: '03',
    title: 'Officer approves',
    body: 'A reviewer sees the bank\u2019s answer beside the submission, resolves anything flagged, and signs off.',
    icon: CheckCircle2,
  },
  {
    step: '04',
    title: 'Tracked to the end',
    body: 'Maturity reminders, renewals, and release requests are handled in the same record — nothing lapses unnoticed.',
    icon: TrendingUp,
  },
];

const trust = [
  {
    icon: Fingerprint,
    title: 'Documents are hash-verified',
    body: 'Every uploaded receipt is fingerprinted with SHA-256, so the file AICTE reviews is provably the file the institution uploaded.',
  },
  {
    icon: KeyRound,
    title: 'Banks confirm without sharing credentials',
    body: 'Verification links are single-use and expire. The branch confirms by one-time code — no portal account, no emailed passwords.',
  },
  {
    icon: ShieldCheck,
    title: 'The audit log cannot be quietly edited',
    body: 'Each entry is chained to the one before it by hash. Changing history breaks the chain, and anyone can run the verification.',
  },
  {
    icon: RefreshCw,
    title: 'Nothing is lost at a handover',
    body: 'Renewal windows and expiry are tracked automatically, with reminders to the institution and escalation if a bank does not respond.',
  },
];

const roles = [
  {
    label: 'Institutions',
    body: 'See every deposit, what is verified, and what needs your action.',
  },
  {
    label: 'Bank branches',
    body: 'Confirm or flag a deposit in minutes, straight from your email.',
  },
  {
    label: 'Reviewing officers',
    body: 'Work a risk-ordered queue with full history on each case.',
  },
  {
    label: 'Nodal officers',
    body: 'Confirm deposits for your branch when the bank cannot.',
  },
  {
    label: 'Auditors',
    body: 'Read-only access to every record and the integrity of its trail.',
  },
  {
    label: 'Administrators',
    body: 'Manage accounts, branches, rules, and the audit trail in one console.',
  },
];

export default function HomePage() {
  return (
    <div className="bg-background relative min-h-screen">
      {/* Ambient background — decorative only, never interactive */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="bg-primary/[0.07] absolute -top-[32rem] left-1/2 h-[52rem] w-[52rem] -translate-x-1/2 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[28rem] right-[-10rem] h-[38rem] w-[38rem] rounded-full bg-[hsl(var(--apple-teal))]/[0.06] blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:64px_64px] opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />
      </div>

      {/* Navigation — translucent, content scrolls beneath it */}
      <header className="border-border/50 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="FDR Portal home">
            <Logo />
          </Link>

          <nav
            className="text-muted-foreground hidden items-center gap-7 text-sm md:flex"
            aria-label="Sections"
          >
            <a href="#workflow" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#trust" className="hover:text-foreground transition-colors">
              Why it&apos;s trustworthy
            </a>
            <a href="#roles" className="hover:text-foreground transition-colors">
              Who it&apos;s for
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href="/login?tab=register">Register</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="animate-fade-in-up text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-[56px]">
              Every security deposit,
              <span className="text-muted-foreground block">verified and accounted for.</span>
            </h1>

            <p className="animate-fade-in-up text-muted-foreground mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed delay-100 sm:text-lg">
              Institutions deposit, banks confirm, officers approve — one record from submission to
              release, with nothing tracked in spreadsheets or email threads.
            </p>

            <div className="animate-fade-in-up mt-9 flex flex-col items-center justify-center gap-3 delay-200 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/login">
                  Sign in to the portal
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <a href="#workflow">See how it works</a>
              </Button>
            </div>
          </div>

          {/* Product preview — a still of the real institution dashboard */}
          <div className="animate-scale-in mt-14 delay-200 sm:mt-20">
            <div className="border-border/70 bg-card/70 mx-auto max-w-4xl overflow-hidden rounded-2xl border shadow-[0_24px_80px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl">
              <div className="border-border/60 flex items-center gap-2 border-b px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="text-muted-foreground ml-3 truncate text-[11px]">
                  fdr-portal / institution / portfolio
                </span>
                <span className="text-muted-foreground/70 border-border/60 ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                  Example
                </span>
              </div>

              <div className="bg-border/50 grid gap-px sm:grid-cols-4">
                {[
                  { label: 'Active FDRs', value: '24' },
                  { label: 'Verified', value: '19' },
                  { label: 'Awaiting bank', value: '3' },
                  { label: 'Expiring soon', value: '2' },
                ].map((item) => (
                  <div key={item.label} className="bg-card px-5 py-5">
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">
                      {item.label}
                    </p>
                    <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-card space-y-2.5 p-5">
                {[
                  {
                    id: 'FDR-2026-001234',
                    bank: 'State Bank of India',
                    status: 'Verified',
                    ok: true,
                  },
                  { id: 'FDR-2026-001235', bank: 'HDFC Bank', status: 'Awaiting bank', ok: false },
                  { id: 'FDR-2026-001236', bank: 'ICICI Bank', status: 'Under review', ok: false },
                ].map((row) => (
                  <div
                    key={row.id}
                    className="border-border/50 hover:bg-muted/40 flex items-center justify-between rounded-lg border px-3.5 py-2.5 transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                        <FileCheck2 className="text-primary h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-medium">{row.id}</p>
                        <p className="text-muted-foreground truncate text-[11px]">{row.bank}</p>
                      </div>
                    </div>
                    <span
                      className={
                        row.ok
                          ? 'shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400'
                          : 'shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400'
                      }
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works — the one story worth telling */}
        <section id="workflow" className="border-border/50 bg-muted/30 scroll-mt-20 border-y">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-primary text-xs font-semibold uppercase tracking-wider">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                One deposit. Four steps. No follow-up emails.
              </h2>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                The same record moves through every stage, so nobody ever asks which copy is
                current.
              </p>
            </div>

            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map((item, index) => (
                <li
                  key={item.step}
                  className="border-border/60 bg-card relative rounded-xl border p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-mono text-xs font-semibold">
                      {item.step}
                    </span>
                    <item.icon className="text-muted-foreground/60 h-4 w-4" />
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{item.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{item.body}</p>
                  {index < workflow.length - 1 && (
                    <ArrowRight
                      aria-hidden
                      className="text-border absolute -right-3.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 lg:block"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust — the actual differentiators, in plain language */}
        <section id="trust" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-primary text-xs font-semibold uppercase tracking-wider">
              Why the record can be trusted
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Verified at every handover, not just collected.
            </h2>
          </div>

          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {trust.map((item) => (
              <div key={item.title} className="flex gap-4">
                <span className="bg-primary/[0.08] text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <item.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold tracking-tight">{item.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for — six roles, one line each */}
        <section id="roles" className="border-border/50 bg-muted/30 scroll-mt-20 border-y">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-primary text-xs font-semibold uppercase tracking-wider">
                Who it&apos;s for
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Six roles, one shared record.
              </h2>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                Everyone sees the deposits they are responsible for — and only those.
              </p>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <div
                  key={role.label}
                  className="border-border/60 bg-card hover:border-primary/30 rounded-xl border p-5 transition-colors"
                >
                  <h3 className="text-sm font-semibold tracking-tight">{role.label}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {role.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA — the single place the page asks for sign-in */}
        <section className="mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8">
          <div className="border-border/60 bg-card relative overflow-hidden rounded-2xl border px-6 py-14 text-center sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary))_0%,transparent_65%)] opacity-[0.07]"
            />
            <h2 className="relative text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready when your next deposit is.
            </h2>
            <p className="text-muted-foreground relative mx-auto mt-3 max-w-md text-balance text-sm leading-relaxed">
              Sign in with your work account. Institutions can register themselves; other roles are
              provisioned by an administrator.
            </p>
            <Button asChild size="lg" className="relative mt-7">
              <Link href="/login">
                Sign in to your workspace
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-border/50 border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6" id="fdr-logo-footer" />
            <span className="text-[13px] font-medium">FDR Portal</span>
            <span className="text-border">&middot;</span>
            <span className="text-muted-foreground text-[13px]">Security Deposit Management</span>
          </div>

          <nav
            className="text-muted-foreground flex items-center gap-6 text-[13px]"
            aria-label="Footer"
          >
            <a href="#workflow" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#trust" className="hover:text-foreground transition-colors">
              Trust
            </a>
            <a href="#roles" className="hover:text-foreground transition-colors">
              Roles
            </a>
          </nav>
        </div>
      </footer>

      <GoToTop />
    </div>
  );
}
