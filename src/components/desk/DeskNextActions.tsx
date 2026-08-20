"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Loader2,
  Zap,
  RefreshCw,
  ChevronRight,
  Plus,
  Check,
  CalendarDays,
  Clock3,
  UserRound,
  BriefcaseBusiness,
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

type ManualTask = {
  id: string;
  title: string;
  createdAt: string;
};

type Props = {
  /** Compact strip for candidates page */
  compact?: boolean;
  /** Dashboard pulse card (matches Active jobs / ON DECK layout) */
  variant?: "default" | "onDeck";
  className?: string;
  limit?: number;
};

function isSequenceDeskAction(a: NextAction): boolean {
  return (
    a.kind === "enroll_sequence" ||
    a.kind === "send_due_step" ||
    a.kind === "mark_reply" ||
    /sequence|enroll/i.test(`${a.label} ${a.reason}`)
  );
}

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
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const [taskDraft, setTaskDraft] = useState("");
  const [taskStorageReady, setTaskStorageReady] = useState(false);
  const [summary, setSummary] = useState<{
    due: number;
    enroll: number;
    urgent: number;
    followUp?: number;
    stale?: number;
  } | null>(null);
  const { dismiss, clearFeed, isHidden, hydrated } = useDismissedItems();

  useEffect(() => {
    if (!onDeck) return;
    try {
      const stored = window.localStorage.getItem("trio-dashboard-tasks");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setManualTasks(parsed);
      }
    } catch {
      // Local quick-add tasks are an enhancement; the server-backed action feed still works.
    } finally {
      setTaskStorageReady(true);
    }
  }, [onDeck]);

  useEffect(() => {
    if (!onDeck || !taskStorageReady) return;
    window.localStorage.setItem("trio-dashboard-tasks", JSON.stringify(manualTasks));
  }, [manualTasks, onDeck, taskStorageReady]);

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
      setActions(
        Array.isArray(data.actions)
          ? data.actions.filter((a: NextAction) => !isSequenceDeskAction(a))
          : []
      );
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

  if (compact && !loading && visibleActions.length === 0 && dismissedCount === 0) {
    return null;
  }

  // ── On Deck card (dashboard pulse design) ──────────────────────────
  if (onDeck) {
    const openItemCount = manualTasks.length + visibleActions.length;

    const addManualTask = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = taskDraft.trim();
      if (!title) return;
      setManualTasks((current) => [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, createdAt: new Date().toISOString() },
        ...current,
      ]);
      setTaskDraft("");
    };

    return (
      <DashboardCard title="To-do" className={className}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={addManualTask} className="flex min-w-0 flex-1 gap-2">
            <label htmlFor="dashboard-task" className="sr-only">Add a task</label>
            <input
              id="dashboard-task"
              value={taskDraft}
              onChange={(event) => setTaskDraft(event.target.value)}
              placeholder="Add a task…"
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <Button type="submit" size="sm" className="h-10 shrink-0 bg-violet-600 px-3 text-white hover:bg-violet-700">
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </form>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <span className="font-medium text-slate-500">{openItemCount} open {openItemCount === 1 ? "item" : "items"}</span>
            {dismissedCount > 0 && (
              <button
                type="button"
                onClick={() => clearFeed("desk")}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Restore
              </button>
            )}
            <Link
              href="/dashboard/candidates"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Priority &amp; next action</span>
          <span className="hidden sm:block">Owner / context</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}

        {!loading && actions.length === 0 && manualTasks.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            Nothing here yet — add a task or keep your pipeline moving.
          </p>
        )}

        {!loading && actions.length > 0 && visibleActions.length === 0 && manualTasks.length === 0 && (
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

        {!loading && (visibleActions.length > 0 || manualTasks.length > 0) && (
          <ul className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
            {manualTasks.map((task) => (
              <li key={task.id} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-100 bg-white px-2.5 py-3 transition hover:border-violet-200 hover:bg-violet-50/30">
                <button
                  type="button"
                  onClick={() => setManualTasks((current) => current.filter((item) => item.id !== task.id))}
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition hover:border-violet-500 hover:bg-violet-50 hover:text-violet-600"
                  aria-label={`Complete ${task.title}`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Added just now</span>
                    <span className="font-medium text-violet-600">Personal task</span>
                  </div>
                </div>
                <span className="hidden items-center gap-1 text-xs text-slate-400 sm:inline-flex"><CalendarDays className="h-3.5 w-3.5" /> Today</span>
              </li>
            ))}
            {visibleActions.map((a, i) => {
              const href = a.candidateId
                ? `/dashboard/candidates/${a.candidateId}`
                : a.jobId
                  ? `/dashboard/jobs/${a.jobId}`
                  : "/dashboard/candidates";
              const line =
                a.reason ||
                a.label ||
                (a.candidateName
                  ? `Follow up with ${a.candidateName}`
                  : "Next action");
              const jobTitle = a.meta?.jobTitle as string | undefined;
              const priorityLabel = a.priority >= 85 ? "Urgent" : a.priority >= 70 ? "High" : "Recommended";
              return (
                <li key={`${a.candidateId}-${a.kind}-${i}`}>
                  <div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-100 bg-white px-2.5 py-3 transition hover:border-blue-200 hover:bg-blue-50/30">
                    <button
                      type="button"
                      title="Dismiss"
                      onClick={() => dismiss(deskActionKey(a))}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 text-transparent hover:border-blue-500 hover:bg-blue-50"
                      aria-label={`Dismiss ${line}`}
                    ><Check className="h-3 w-3" /></button>
                    <Link href={href} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {line}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        {a.candidateName && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{a.candidateName}</span>}
                        {jobTitle && <span className="inline-flex min-w-0 items-center gap-1 truncate"><BriefcaseBusiness className="h-3 w-3 shrink-0" />{jobTitle}</span>}
                      </div>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.priority >= 85 ? "bg-red-50 text-red-700" : a.priority >= 70 ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{priorityLabel}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarDays className="h-3 w-3" />{actionDateHint(a)}</span>
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
              {summary.urgent} urgent
              {(summary.followUp ?? 0) > 0 ? ` · ${summary.followUp} follow-up` : ""}
              {(summary.stale ?? 0) > 0 ? ` · ${summary.stale} stale` : ""}
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
