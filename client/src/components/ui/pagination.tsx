'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  limit?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Page numbers with ellipses, always showing the first and last page. */
function buildPages(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) {
    return total !== undefined ? (
      <p className={cn('text-muted-foreground text-xs', className)}>
        {total} {total === 1 ? 'record' : 'records'}
      </p>
    ) : null;
  }

  const from = limit ? (page - 1) * limit + 1 : undefined;
  const to = limit ? Math.min(page * limit, total ?? page * limit) : undefined;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {total !== undefined && (
        <p className="text-muted-foreground text-xs">
          {from !== undefined && to !== undefined
            ? `${from}–${to} of ${total}`
            : `${total} records`}
        </p>
      )}
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {buildPages(page, totalPages).map((entry, index) =>
          entry === 'ellipsis' ? (
            <span key={`e-${index}`} className="text-muted-foreground px-1">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          ) : (
            <Button
              key={entry}
              variant={entry === page ? 'default' : 'ghost'}
              size="sm"
              className="h-8 min-w-8 px-2 text-xs"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
            >
              {entry}
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}
