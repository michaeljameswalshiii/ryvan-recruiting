/**
 * Canonical job posting statuses.
 * All UI + APIs should read/write these Title-Case values.
 */

export const JOB_STATUSES = [
  "Open",
  "Paused",
  "Filled",
  "Lost",
  "Closed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Human-readable help under status chips / filters */
export const JOB_STATUS_META: Record<
  JobStatus,
  { label: string; description: string; badge: string }
> = {
  Open: {
    label: "Open",
    description: "Actively hiring",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  Paused: {
    label: "Paused",
    description: "Temporarily on hold",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
  },
  Filled: {
    label: "Filled",
    description: "Placed / won",
    badge: "bg-sky-50 text-sky-800 border-sky-200",
  },
  Lost: {
    label: "Lost",
    description: "Lost the req / cancelled by client",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
  },
  Closed: {
    label: "Closed",
    description: "Closed without fill (or legacy close)",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

/**
 * Normalize any stored / UI / AI status into a canonical JobStatus.
 * Maps legacy values so existing jobs can move into the new set without a DB migration.
 *
 * Legacy → New:
 *   Open, OPEN, active, hiring     → Open
 *   On Hold, PAUSED, Paused, hold  → Paused
 *   Filled, placed, hired, won     → Filled
 *   Lost, cancelled, canceled      → Lost
 *   Closed, CLOSED, close          → Closed
 */
export function normalizeJobStatus(raw?: string | null): JobStatus {
  const s = String(raw || "Open")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, " ");

  if (
    s === "paused" ||
    s === "on hold" ||
    s === "onhold" ||
    s === "hold" ||
    s === "pause"
  ) {
    return "Paused";
  }
  if (
    s === "filled" ||
    s === "placed" ||
    s === "hired" ||
    s === "won" ||
    s === "fill"
  ) {
    return "Filled";
  }
  if (
    s === "lost" ||
    s === "cancelled" ||
    s === "canceled" ||
    s === "no fill" ||
    s === "nofill"
  ) {
    return "Lost";
  }
  if (s === "closed" || s === "close" || s === "ended" || s === "inactive") {
    return "Closed";
  }
  if (s === "open" || s === "active" || s === "hiring" || s === "live") {
    return "Open";
  }

  // Exact match against canonical (already Title Case)
  const exact = JOB_STATUSES.find((x) => x.toLowerCase() === s);
  if (exact) return exact;

  return "Open";
}

export function isCanonicalJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

/** Only Open jobs can appear on the public careers site (when showOnWebsite). */
export function isJobOpenForCareers(status?: string | null): boolean {
  return normalizeJobStatus(status) === "Open";
}

export function jobStatusBadgeClasses(status?: string | null): string {
  return JOB_STATUS_META[normalizeJobStatus(status)].badge;
}

/** Sort rank for list views (higher = more "active") */
export function jobStatusSortRank(status?: string | null): number {
  const s = normalizeJobStatus(status);
  const order: Record<JobStatus, number> = {
    Open: 5,
    Paused: 4,
    Filled: 3,
    Lost: 2,
    Closed: 1,
  };
  return order[s];
}
