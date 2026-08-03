'use client';

/**
 * Top-of-list numbered pagination (5 items per page by default).
 * Place above tables / timelines so users can jump without scrolling first.
 *
 * Contrast: never rely on text-foreground / muted-foreground alone on white
 * bars in dark mode (those tokens are near-white on charcoal canvas).
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const DEFAULT_PAGE_SIZE = 5;

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE
): {
  page: number;
  totalPages: number;
  total: number;
  slice: T[];
  start: number;
  end: number;
} {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    page: safePage,
    totalPages,
    total,
    slice,
    start,
    end: start + slice.length,
  };
}

/** Build a compact page number list with ellipsis for large sets. */
export function pageNumbers(current: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export type PaginationBarProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** e.g. "companies", "activities" */
  itemLabel?: string;
  className?: string;
  /** Hide entirely when only one page (default true) */
  hideWhenSinglePage?: boolean;
};

export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  itemLabel = 'items',
  className = '',
  hideWhenSinglePage = true,
}: PaginationBarProps) {
  if (total === 0) return null;
  if (hideWhenSinglePage && totalPages <= 1) {
    return (
      <div
        className={`flex items-center justify-between gap-2 text-xs font-medium text-slate-700 dark:text-slate-100 ${className}`}
      >
        <span>
          {total} {itemLabel}
        </span>
      </div>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const nums = pageNumbers(page, totalPages);

  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}
      role="navigation"
      aria-label="Pagination"
    >
      <p className="text-xs font-medium tabular-nums text-slate-700 dark:text-slate-100">
        Showing{' '}
        <span className="font-semibold text-slate-900 dark:text-white">
          {start}–{end}
        </span>{' '}
        of{' '}
        <span className="font-semibold text-slate-900 dark:text-white">{total}</span>{' '}
        {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span
              key={`e-${i}`}
              className="px-1.5 text-xs font-medium text-slate-600 dark:text-slate-200 select-none"
            >
              …
            </span>
          ) : (
            <Button
              key={n}
              type="button"
              variant={n === page ? 'default' : 'outline'}
              size="sm"
              className={`h-8 min-w-8 px-2 text-xs font-semibold tabular-nums ${
                n === page
                  ? 'pointer-events-none bg-blue-600 text-white border-blue-600'
                  : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600'
              }`}
              onClick={() => onPageChange(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
