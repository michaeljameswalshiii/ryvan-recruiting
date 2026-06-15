/**
 * Skeleton Component
 * Loading placeholder for data-heavy components
 */

import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "card" | "table" | "list";
}

export function Skeleton({ 
  className, 
  variant = "default",
  ...props 
}: SkeletonProps) {
  const variantStyles = {
    default: "h-4 w-full",
    card: "h-32 w-full rounded-lg",
    table: "h-8 w-full",
    list: "h-12 w-full",
  };

  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

/**
 * Card skeleton for dashboard
 */
export function CardSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Table row skeleton
 */
export function TableRowSkeleton() {
  return (
    <div className="grid gap-4 py-3 px-4 border-b border-border items-center">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16 rounded" />
    </div>
  );
}

/**
 * Stats card skeleton
 */
export function StatsCardSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-8 w-12" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Data table skeleton with multiple rows
 */
export function DataTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid gap-4 py-3 px-4 border-b border-border">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </div>
  );
}
