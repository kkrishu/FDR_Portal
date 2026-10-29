'use client';

import { useEffect } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real cause in the console; the card below stays user-facing.
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-5 py-16">
      <div className="border-border/60 bg-card w-full max-w-md rounded-xl border p-8 text-center">
        <div className="bg-destructive/10 text-destructive mx-auto flex h-11 w-11 items-center justify-center rounded-xl">
          <AlertTriangle className="h-5 w-5" />
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          This view failed to load. Trying again usually resolves it; if it keeps happening, the
          error reference below will help trace it.
        </p>

        {error.digest && (
          <p className="bg-muted text-muted-foreground mt-4 rounded-lg px-3 py-2 font-mono text-[11px]">
            {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <Button onClick={reset}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <a href="/">
              <Home className="mr-1.5 h-4 w-4" />
              Go home
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
