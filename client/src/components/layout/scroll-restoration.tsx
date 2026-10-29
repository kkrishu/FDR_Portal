'use client';

/**
 * Scroll restoration across reloads and back/forward.
 *
 * The browser's own restoration is defeated here by async data: SWR resolves
 * after the browser restores, the page is briefly short, and the position is
 * clamped to the top. This component persists the position per URL and
 * re-asserts it a few times during the first second, by which point list data
 * has rendered and the page is tall enough to hold the position.
 *
 * It only restores for reload and back/forward navigations — following a fresh
 * link should still open at the top.
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const KEY_PREFIX = 'fdr-scroll:';

function storageKey(pathname: string, search: string) {
  return `${KEY_PREFIX}${pathname}${search}`;
}

function ScrollRestorationInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
    const key = storageKey(pathname, search);

    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        /* storage unavailable — restoration is a nicety, not a requirement */
      }
    };

    const onScroll = () => {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = undefined;
        save();
      }, 120);
    };

    const navigationType = (
      performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    )?.type;
    const shouldRestore = navigationType === 'reload' || navigationType === 'back_forward';

    const restore = () => {
      if (!shouldRestore) return;
      try {
        const saved = sessionStorage.getItem(key);
        if (saved === null) return;
        const target = Number(saved);
        // Only claim the position when the document is actually tall enough;
        // otherwise the browser clamps us to the top anyway.
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (target > 0 && target <= maxScroll + 40) {
          window.scrollTo({ top: target, behavior: 'auto' });
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Re-assert while async content streams in: immediately, then as the data
    // and any tables/skeletons settle. Each attempt is cheap and idempotent.
    restore();
    const timers = [120, 400, 900, 1600].map((delay) => setTimeout(restore, delay));

    return () => {
      window.removeEventListener('scroll', onScroll);
      timers.forEach(clearTimeout);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [pathname, searchParams]);

  return null;
}

export function ScrollRestoration() {
  // useSearchParams opts the tree into client rendering; the Suspense boundary
  // keeps the root layout prerenderable.
  return (
    <Suspense fallback={null}>
      <ScrollRestorationInner />
    </Suspense>
  );
}
