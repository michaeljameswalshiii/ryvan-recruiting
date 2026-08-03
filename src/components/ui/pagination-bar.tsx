'use client';

/**
 * Top-of-list numbered pagination.
 * Dark mode: white text on dark panels (data-dark-panel + explicit classes).
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
  itemLabel?: string;
  className?: string;
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
        data-dark-panel
        className={`flex items-center justify-between gap-2 text-xs font-medium text-slate-800 dark:!text-white ${className}`}
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
      data-dark-panel
      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}
      role="navigation"
      aria-label="Pagination"
    >
      <p className="text-xs font-medium tabular-nums text-slate-800 dark:!text-white">
        Showing{' '}
        <span className="font-bold text-slate-900 dark:!text-white">
          {start}–{end}
        </span>{' '}
        of{' '}
        <span className="font-bold text-slate-900 dark:!text-white">{total}</span>{' '}
        {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-slate-300 dark:border-white/40 bg-white dark:bg-slate-700 text-slate-900 dark:!text-white hover:bg-slate-100 dark:hover:bg-slate-600"
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
              className="px-1.5 text-xs font-medium text-slate-600 dark:!text-white select-none"
            >
              …
            </span>
          ) : (
            <Button
              key={n}
              type="button"
              size="sm"
              className={`h-8 min-w-8 px-2 text-xs font-bold tabular-nums ${
                n === page
                  ? 'pointer-events-none bg-blue-600 text-white border-blue-600 hover:bg-blue-600'
                  : 'border border-slate-300 dark:border-white/40 bg-white dark:bg-slate-700 text-slate-900 dark:!text-white hover:bg-slate-100 dark:hover:bg-slate-600'
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
          className="h-8 w-8 p-0 border-slate-300 dark:border-white/40 bg-white dark:bg-slate-700 text-slate-900 dark:!text-white hover:bg-slate-100 dark:hover:bg-slate-600"
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
