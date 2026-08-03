'use client';

/**
 * Top-of-list numbered pagination.
 * Default: white bar + dark ink (matches light filter cards on dark canvas).
 * forceLightText: white ink on dark bar (legacy; prefer white bar + dark ink).
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const DEFAULT_PAGE_SIZE = 15;

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
  /** White text on dark bar. Prefer default white bar + dark ink. */
  forceLightText?: boolean;
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
  forceLightText = false,
}: PaginationBarProps) {
  // Inline ink so global dark remaps cannot hide "Showing X of Y"
  const ink = forceLightText ? '#ffffff' : '#0f172a';
  const muted = forceLightText ? 'rgba(255,255,255,0.9)' : '#334155';
  const btnBg = forceLightText ? '#334155' : '#ffffff';
  const btnBorder = forceLightText ? 'rgba(255,255,255,0.45)' : '#cbd5e1';

  if (total === 0) return null;
  if (hideWhenSinglePage && totalPages <= 1) {
    return (
      <div
        className={`flex items-center justify-between gap-2 text-xs font-medium ${className}`}
        style={{ color: ink }}
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
      style={
        forceLightText
          ? { color: ink, backgroundColor: '#1e293b' }
          : { color: ink }
      }
    >
      <p className="text-xs font-medium tabular-nums" style={{ color: muted }}>
        Showing{' '}
        <span className="font-bold" style={{ color: ink }}>
          {start}–{end}
        </span>{' '}
        of{' '}
        <span className="font-bold" style={{ color: ink }}>
          {total}
        </span>{' '}
        {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          style={{ color: ink, backgroundColor: btnBg, borderColor: btnBorder }}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" style={{ color: ink }} />
        </Button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span
              key={`e-${i}`}
              className="px-1.5 text-xs font-medium select-none"
              style={{ color: muted }}
            >
              …
            </span>
          ) : (
            <Button
              key={n}
              type="button"
              size="sm"
              className={`h-8 min-w-8 px-2 text-xs font-bold tabular-nums ${
                n === page ? 'pointer-events-none' : ''
              }`}
              style={
                n === page
                  ? {
                      color: '#ffffff',
                      backgroundColor: '#2563eb',
                      borderColor: '#2563eb',
                    }
                  : {
                      color: ink,
                      backgroundColor: btnBg,
                      borderColor: btnBorder,
                    }
              }
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
          className="h-8 w-8 p-0"
          style={{ color: ink, backgroundColor: btnBg, borderColor: btnBorder }}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" style={{ color: ink }} />
        </Button>
      </div>
    </div>
  );
}
