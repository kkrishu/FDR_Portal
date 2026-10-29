import { cn } from '@/lib/utils';

/**
 * Placeholder shown while data loads. Uses the same shimmer timing as the
 * branded loader so a page never appears to jump between two visual languages.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-muted animate-pulse rounded-md', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
