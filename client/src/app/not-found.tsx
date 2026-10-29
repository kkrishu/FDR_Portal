import Link from 'next/link';
import { ArrowLeft, Compass, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

export default function NotFound() {
  return (
    <div className="bg-background relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-primary/[0.06] absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]" />
      </div>

      <div className="relative w-full max-w-md text-center">
        <Link href="/" aria-label="FDR Portal home">
          <Logo markClassName="h-9 w-9" />
        </Link>

        <p className="text-muted-foreground mt-10 font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">
          404 — Not found
        </p>
        <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          This page does not exist.
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-balance text-sm leading-relaxed">
          The link may be outdated, or the record you were looking for has been moved. Your
          dashboard is still where you left it.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <Button asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="mr-1.5 h-4 w-4" />
              Go to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </div>

        <div className="text-muted-foreground mt-10 flex items-center justify-center gap-2 text-xs">
          <Compass className="h-3.5 w-3.5" />
          <span>If you followed a link from inside the portal, please report it.</span>
        </div>
      </div>
    </div>
  );
}
