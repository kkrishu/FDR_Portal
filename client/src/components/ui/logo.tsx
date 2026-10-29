import { cn } from '@/lib/utils';

interface LogoMarkProps {
  className?: string;
  /** Render just the mark with no tile behind it. */
  bare?: boolean;
  /** Unique gradient id — required when several marks share a page. */
  id?: string;
}

/**
 * FDR Portal monogram: an "F" for Fixed Deposit Receipt, paired with a check
 * for verification. Drawn on a 32-unit grid so it stays crisp at 16px in the
 * browser tab and at 512px in the app icon.
 */
export function LogoMark({ className, bare = false, id = 'fdr-logo' }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="FDR Portal"
    >
      {!bare && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1B4270" />
              <stop offset="1" stopColor="#0A1F3C" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8.5" fill={`url(#${id})`} />
        </>
      )}
      <path
        d="M10.8 8.8V23.2M10.8 8.8H18.4M10.8 15.8H16.4"
        fill="none"
        stroke={bare ? 'currentColor' : '#ffffff'}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.4 20.6L19.9 23.1L25 15.6"
        fill="none"
        stroke={bare ? 'currentColor' : '#ffffff'}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  /** Hide the wordmark, e.g. in the collapsed sidebar. */
  markOnly?: boolean;
  subtitle?: string;
  className?: string;
  markClassName?: string;
}

/** Mark plus wordmark, sized for headers and sidebars. */
export function Logo({ markOnly = false, subtitle, className, markClassName }: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2.5 overflow-hidden', className)}>
      <LogoMark className={cn('h-8 w-8', markClassName)} />
      {!markOnly && (
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight">
            FDR Portal
          </span>
          {subtitle && (
            <span className="text-muted-foreground block truncate text-[11px]">{subtitle}</span>
          )}
        </span>
      )}
    </span>
  );
}
