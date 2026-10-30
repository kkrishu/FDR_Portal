'use client';

import { Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Light theme indicator - no toggle, just shows the current theme is light.
 * Theme is locked to light for consistent Apple-design aesthetic.
 */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-9 w-9', className)}
      aria-label="Theme: Light"
      disabled
    >
      <Sun className="h-[18px] w-[18px]" />
    </Button>
  );
}
