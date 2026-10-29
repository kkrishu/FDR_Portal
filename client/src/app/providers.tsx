'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * Client providers. Order matters: the theme class must be on <html> before
 * anything paints, and SWR has to wrap every page that reads data.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SWRConfig
        value={{
          // The API is authoritative and mutations revalidate explicitly, so a
          // focus refetch would only add noise.
          revalidateOnFocus: false,
          shouldRetryOnError: false,
          keepPreviousData: true,
        }}
      >
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4500}
          // Clear the dashboard toolbar so a toast never covers the account menu.
          offset={{ top: '72px', right: '16px' }}
          mobileOffset={{ top: '16px', right: '12px', left: '12px' }}
          toastOptions={{
            classNames: {
              // A fixed width stops short messages from sitting in a wide, mostly
              // empty bar, and the spacing utilities are declared once here rather
              // than fighting the global .toast rules in globals.css.
              toast:
                'w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[0_10px_38px_-12px_rgba(15,23,42,0.28)]',
              title: 'text-[13px] font-semibold leading-snug text-foreground',
              description: 'mt-0.5 text-[12px] leading-relaxed text-muted-foreground',
              closeButton:
                'border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-accent',
              icon: 'mt-0.5 shrink-0',
            },
          }}
        />
      </SWRConfig>
    </ThemeProvider>
  );
}
