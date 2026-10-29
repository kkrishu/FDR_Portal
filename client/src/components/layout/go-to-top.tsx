'use client';

/**
 * Floating "back to top" control for long marketing pages.
 *
 * Appears after the first viewport of scrolling, hides again near the top, and
 * respects reduced-motion by jumping instead of gliding.
 */

import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GoToTop() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })}
      aria-label="Back to top"
      className={cn(
        'border-border/70 bg-card/90 text-muted-foreground hover:text-foreground fixed bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_8px_24px_-8px_rgba(15,23,42,0.25)] backdrop-blur transition-all duration-300',
        'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        visible
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0'
      )}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
