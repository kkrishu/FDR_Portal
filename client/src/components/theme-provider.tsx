'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Light theme only - no dark mode or system preference support.
 * Forces light theme for consistent Apple-design aesthetic.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      themes={['light']}
    >
      {children}
    </NextThemesProvider>
  );
}
