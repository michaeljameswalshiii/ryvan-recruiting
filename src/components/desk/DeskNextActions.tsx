"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Zap,
  RefreshCw,
  Play,
  UserPlus,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DismissRowButton } from "@/components/ui/DismissRowButton";
import { useDismissedItems } from "@/hooks/useDismissedItems";
import { buildDismissKey } from "@/lib/ui/dismissed-items";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type NextAction = {
  kind: string;
  priority: number;
  label: string;
  reason: string;
  candidateId?: string;
  candidateName?: string;
  jobId?: string;
  meta?: Record<string, unknown>;
};

type Props = {
  /** Compact strip for candidates page */
  compact?: boolean;
  /** Dashboard pulse card (matches Active jobs / ON DECK layout) */
  variant?: "default" | "onDeck";
  className?: string;
  limit?: number;
};

function deskActionKey(a: NextAction): string {
  return buildDismissKey({
    feed: "desk",
    entityType: "candidate",
    entityId: a.candidateId || a.meta?.enrollmentId?.toString() || a.label,
    actionKind: a.kind,
    extra: a.jobId || undefined,
  });
}

/** Map action kinds to short tags shown on the right of On Deck rows */
function actionTag(kind: string, label: string): string {
  const k = kind.toLowerCase();
  if (k.includes("interview") || /interview/i.test(label)) return "Interview";
  if (k.includes("follow") || /follow/i.test(label)) return "Follow-up";
  if (k.includes("offer") || /offer/i.test(label)) return "Offer";
  if (k.includes("feedback") || /feedback/i.test(label)) return "Feedback";
  if (k.includes("enroll") || k.includes("sequence")) return "Prep";
  if (k.includes("send") || k.includes("due")) return "Follow-up";
  if (k.includes("admin") || k.includes("status")) return "Admin";
  return label.split(" ")[0] || "Action";
}

function actionDateHint(a: NextAction): string {
  const raw =
    (a.meta?.dueAt as string) ||
    (a.meta?.nextRunAt as string) ||
    (a.meta?.date as string);
  if (raw && !Number.isNaN(Date.parse(raw))) {
    return new Date(raw).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  // Stable-ish relative hint from priority band
  if (a.priority >= 80) return "Today";
  if (a.priority >= 50) return "Soon";
  return "Queued";
}

export function DeskNextActions({
  compact,
  variant = "default",
  className,
  limit = 12,
}: Props) {
  const onDeck = variant === "onDeck";
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [summary, setSummary] = useState<{
    due: number;
    enroll: number;
    urgent: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { dismiss, clearFeed, isHidden, hydrated } = useDismissedItems();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/desk/next-actions?limit=${limit}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        if (!compact && !onDeck)
          toast.error(data.error || "Failed to load desk actions");
        return;
      }
      setActions(Array.isArray(data.actions) ? data.actions : []);
      setSummary(data.summary || null);
    } catch {
      if (!compact && !onDeck) toast.error("Failed to load desk actions");
    } finally {
      setLoading(false);
    }
  }, [limit, compact, onDeck]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleActions = useMemo(() => {
    if (!hydrated) return actions;
    return actions.filter((a) => !isHidden(deskActionKey(a)));
  }, [actions, hydrated, isHidden]);

  const dismissedCount = useMemo(() => {
    if (!hydrated) return 0;
    return actions.filter((a) => isHidden(deskActionKey(a))).length;
  }, [actions, hydrated, isHidden]);

  async function runDue(enrollmentId?: string) {
    setBusy(enrollmentId || "batch");
    try {
      const res = await fetch("/api/sequences/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          enrollmentId ? { enrollmentId, force: true } : { limit: 20 }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Run failed");
        return;
      }
      if (data.mode === "single") {
        toast.success(
          data.result?.success
            ? data.result.message || "Step ran"
            : data.result?.message || "Failed"
        );
      } else {
        toast.success(
          `Processed ${data.processed}: ${data.sent} ok, ${data.failed} failed`
        );
      }
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function quickEnroll(
    candidateId: string,
    jobId?: string,
    name?: string
  ) {
    setBusy(`enroll-${candidateId}`);
    try {
      const res = await fetch("/api/sequences/quick-enroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          jobId: jobId && jobId !== "unassigned" ? jobId : undefined,
          runFirstStep: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Enroll failed");
        return;
      }
      toast.success(
        `Enrolled ${name || "candidate"}${
          data.firstStepRan && data.runResult?.success
            ? " · first step sent"
            : ""
        }`
      );
      await load();
    } catch {
      toast.error("Enroll failed");
    } finally {
      setBusy(null);
    }
  }

  if (compact && !loading && visibleActions.length === 0 && dismissedCount === 0) {
    return null;
  }

  // ── On Deck card (dashboard pulse design) ──────────────────────────
  if (onDeck) {
    return (
      <DashboardCard title="On deck" className={className} defaultCollapsed>
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className="mt-0.5 text-xs text-gray-500">
            Action items to keep your pipeline moving.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dismissedCount > 0 && (
              <button
                type="button"
                onClick={() => clearFeed("desk")}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Restore
              </button>
            )}
            {visibleActions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  for (const a of visibleActions) dismiss(deskActionKey(a));
                }}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Dismiss
              </button>
            )}
            <Link
              href="/dashboard/sequences"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}

        {!loading && actions.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            Nothing on deck — pipeline looks clear.
          </p>
        )}

        {!loading && actions.length > 0 && visibleActions.length === 0 && (
          <div className="py-6 text-center text-sm text-gray-500">
            All on-deck items dismissed.{" "}
            {dismissedCount > 0 && (
              <button
                type="button"
                onClick={() => clearFeed("desk")}
                className="font-medium text-blue-600 hover:underline"
              >
                Restore ({dismissedCount})
              </button>
            )}
          </div>
        )}

        {!loading && visibleActions.length > 0 && (
          <ul className="max-h-[320px] space-y-1 overflow-y-auto">
            {visibleActions.map((a, i) => {
              const href = a.candidateId
                ? `/dashboard/candidates/${a.candidateId}`
                : a.jobId
                  ? `/dashboard/jobs/${a.jobId}`
                  : "/dashboard/sequences";
              const line =
                a.reason ||
                a.label ||
                (a.candidateName
                  ? `Follow up with ${a.candidateName}`
                  : "Next action");
              return (
                <li key={`${a.candidateId}-${a.kind}-${i}`}>
                  <div className="group flex items-center gap-2 rounded-xl px-1 py-2 hover:bg-gray-50">
                    <button
                      type="button"
                      title="Dismiss"
                      onClick={() => dismiss(deskActionKey(a))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50"
                      aria-label={`Dismiss ${line}`}
                    />
                    <Link href={href} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {line}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2 text-right">
                      <span className="text-xs text-gray-500">
                        {actionTag(a.kind, a.label)}
                      </span>
                      <span className="w-12 text-[11px] tabular-nums text-gray-400">
                        {actionDateHint(a)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DashboardCard>
    );
  }

  // ── Desk strip (slate — no yellow) ─────────────────────────────────
  return (
    <section
      data-ink-on-light className={`surface-light rounded-xl border border-slate-200 bg-slate-50 ${
        compact ? "p-3" : "p-4 shadow-sm"
      } ${className || ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Zap className="h-4 w-4 shrink-0 text-slate-600" />
          <span className="text-sm font-semibold text-slate-900">
            Next Actions
          </span>
          {summary && (
            <span className="truncate text-[11px] font-medium text-slate-700">
              {summary.urgent} urgent · {summary.due} due · {summary.enroll}{" "}
              enroll
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {dismissedCount > 0 && (
            <button
              type="button"
              onClick={() => clearFeed("desk")}
              className="px-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:underline"
              title="Show desk items you dismissed"
            >
              Restore {dismissedCount}
            </button>
          )}
          {visibleActions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                for (const a of visibleActions) {
                  dismiss(deskActionKey(a));
                }
              }}
              className="px-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:underline"
              title="Dismiss all visible desk actions for 30 days"
            >
              Dismiss
            </button>
          )}
          {(summary?.due || 0) > 0 && (
            <Button
              type="button"
              size="sm"
              className="h-7 bg-emerald-700 text-[11px] hover:bg-emerald-800"
              disabled={busy === "batch"}
              onClick={() => runDue()}
            >
              {busy === "batch" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Run due
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-2 text-xs font-medium text-slate-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && actions.length === 0 && (
        <p className="py-1 text-xs font-medium text-slate-700">
          No urgent desk actions right now.
        </p>
      )}

      {!loading && actions.length > 0 && visibleActions.length === 0 && (
        <div className="flex items-center gap-2 py-1 text-xs font-medium text-slate-700">
          <span>All desk actions dismissed for now.</span>
          {dismissedCount > 0 && (
            <button
              type="button"
              onClick={() => clearFeed("desk")}
              className="font-semibold text-blue-700 hover:underline"
            >
              Restore {dismissedCount}
            </button>
          )}
        </div>
      )}

      {!loading && visibleActions.length > 0 && (
        <ul
          className={`space-y-1.5 ${compact ? "max-h-36" : "max-h-64"} overflow-y-auto`}
        >
          {visibleActions.map((a, i) => {
            const enrollId = a.meta?.enrollmentId as string | undefined;
            const jobTitle = a.meta?.jobTitle as string | undefined;
            return (
              <li
                key={`${a.candidateId}-${a.kind}-${i}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">
                    {a.candidateName || a.candidateId?.slice(0, 8)}
                    <span className="font-medium text-slate-700">
                      {" "}
                      · {a.label}
                    </span>
                  </div>
                  <div className="truncate text-[11px] font-medium text-slate-700">
                    {jobTitle ? `${jobTitle} · ` : ""}
                    {a.reason}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {a.kind === "send_due_step" && enrollId && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 bg-emerald-700 px-2 text-[10px] text-white hover:bg-emerald-800"
                      disabled={!!busy}
                      onClick={() => runDue(enrollId)}
                    >
                      Run
                    </Button>
                  )}
                  {a.kind === "enroll_sequence" && a.candidateId && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={!!busy}
                      onClick={() =>
                        quickEnroll(a.candidateId!, a.jobId, a.candidateName)
                      }
                    >
                      <UserPlus className="mr-0.5 h-3 w-3" />
                      Enroll
                    </Button>
                  )}
                  {a.candidateId && (
                    <Link
                      href={`/dashboard/candidates/${a.candidateId}`}
                      title={`Open ${a.candidateName || "candidate"}`}
                      className="inline-flex items-center rounded p-0.5 text-blue-700 hover:bg-blue-50"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <DismissRowButton
                    alwaysVisible
                    label={`Dismiss ${a.candidateName || "action"}`}
                    onDismiss={() => dismiss(deskActionKey(a))}
                    className="shrink-0 rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
