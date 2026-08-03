"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Zap,
  Mail,
  UserPlus,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DismissRowButton } from "@/components/ui/DismissRowButton";
import { useDismissedItems } from "@/hooks/useDismissedItems";
import { buildDismissKey } from "@/lib/ui/dismissed-items";
import { toast } from "sonner";

type NextAction = {
  kind: string;
  priority: number;
  label: string;
  reason: string;
  cta?: string;
  candidateId?: string;
  candidateName?: string;
  jobId?: string;
  meta?: Record<string, unknown>;
};

type Props = {
  jobId: string;
  className?: string;
};

/** Tailwind light pastel classes — final globals law: light box → black text */
function kindClass(kind: string): string {
  if (kind === "send_due_step") return "bg-emerald-50 border-emerald-200";
  if (kind === "enroll_sequence") return "bg-blue-50 border-blue-200";
  if (kind === "submit") return "bg-violet-50 border-violet-200";
  if (kind === "revive_stale") return "bg-amber-50 border-amber-200";
  if (kind === "source_more") return "bg-sky-50 border-sky-200";
  return "bg-white border-slate-200";
}

function jobNextKey(jobId: string, a: NextAction): string {
  return buildDismissKey({
    feed: "job_next",
    entityType: a.candidateId ? "candidate" : "job",
    entityId: a.candidateId || jobId,
    actionKind: a.kind,
    extra: jobId,
  });
}

export function NextActionPanel({ jobId, className }: Props) {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [summary, setSummary] = useState<{
    urgent: number;
    enroll: number;
    due: number;
    stale: number;
  } | null>(null);
  const [jobAction, setJobAction] = useState<NextAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { dismiss, clearFeed, isHidden, hydrated } = useDismissedItems();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/next-actions`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load next actions");
        return;
      }
      setActions(Array.isArray(data.actions) ? data.actions : []);
      setSummary(data.summary || null);
      setJobAction(data.jobAction || null);
    } catch {
      toast.error("Failed to load next actions");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDue(enrollmentId?: string) {
    setBusyId(enrollmentId || "batch");
    try {
      const res = await fetch("/api/sequences/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          enrollmentId
            ? { enrollmentId, force: true }
            : { limit: 25 }
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
            : data.result?.message || "Step failed"
        );
      } else {
        toast.success(
          `Processed ${data.processed}: ${data.sent} ok, ${data.failed} failed`
        );
      }
      await load();
    } catch {
      toast.error("Network error running sequence");
    } finally {
      setBusyId(null);
    }
  }

  async function logReply(enrollmentId: string, classification: "positive" | "negative") {
    setBusyId(enrollmentId);
    try {
      const res = await fetch(
        `/api/sequences/enrollments/${encodeURIComponent(enrollmentId)}/reply`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classification }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to log reply");
        return;
      }
      toast.success(
        `Reply logged (${data.classification})${
          data.stageSuggestion ? ` → ${data.stageSuggestion}` : ""
        }`
      );
      await load();
    } catch {
      toast.error("Failed to log reply");
    } finally {
      setBusyId(null);
    }
  }

  async function quickEnroll(candidateId: string, name?: string) {
    setBusyId(`enroll-${candidateId}`);
    try {
      const res = await fetch("/api/sequences/quick-enroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          jobId,
          runFirstStep: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Enroll failed");
        return;
      }
      const ran = data.firstStepRan
        ? data.runResult?.success
          ? " · first step sent"
          : ` · first step: ${data.runResult?.message || "not sent"}`
        : "";
      toast.success(
        `Enrolled ${name || "candidate"} in ${data.sequence?.name || "sequence"}${ran}`
      );
      await load();
    } catch {
      toast.error("Network error enrolling");
    } finally {
      setBusyId(null);
    }
  }

  const top = useMemo(
    () => actions.filter((a) => a.kind !== "none").slice(0, 12),
    [actions]
  );

  const visibleTop = useMemo(() => {
    if (!hydrated) return top;
    return top.filter((a) => !isHidden(jobNextKey(jobId, a)));
  }, [top, hydrated, isHidden, jobId]);

  const dismissedCount = useMemo(() => {
    if (!hydrated) return 0;
    return top.filter((a) => isHidden(jobNextKey(jobId, a))).length;
  }, [top, hydrated, isHidden, jobId]);

  const jobActionKey = jobAction
    ? jobNextKey(jobId, { ...jobAction, candidateId: undefined })
    : "";
  const showJobAction =
    !!jobAction && (!hydrated || !isHidden(jobActionKey));

  return (
    <section
      data-ink-on-light
      className={`rounded-2xl border border-amber-200 bg-amber-50 shadow-sm ${className || ""}`}
    >
      {/* Component-scoped lock (valid selectors only — invalid :not() was a no-op) */}
      <style>{`
        [data-next-actions-root],
        [data-next-actions-root] * {
          color: #0f172a !important;
          -webkit-text-fill-color: #0f172a !important;
        }
        [data-next-actions-root] [data-ink-muted] {
          color: #334155 !important;
          -webkit-text-fill-color: #334155 !important;
        }
        [data-next-actions-root] [data-ink-keep],
        [data-next-actions-root] [data-ink-keep] * {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
      `}</style>
      <div data-next-actions-root>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-amber-200">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Zap className="h-4 w-4 shrink-0 text-amber-600" />
          <h3 className="text-sm font-semibold">Next actions</h3>
          {summary && (
            <span className="text-[11px] font-medium" data-ink-muted>
              {summary.urgent} urgent · {summary.due} due · {summary.enroll}{" "}
              enroll · {summary.stale} stale
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {dismissedCount > 0 && (
            <button
              type="button"
              onClick={() => clearFeed("job_next")}
              className="text-[11px] font-semibold hover:underline px-1"
              data-ink-muted
            >
              Restore {dismissedCount}
            </button>
          )}
          {(visibleTop.length > 0 || showJobAction) && (
            <button
              type="button"
              onClick={() => {
                if (showJobAction && jobAction) dismiss(jobActionKey);
                for (const a of visibleTop) dismiss(jobNextKey(jobId, a));
              }}
              className="text-[11px] font-semibold hover:underline px-1"
              data-ink-muted
              title="Dismiss all visible next actions for 30 days"
            >
              Dismiss
            </button>
          )}
          <Button
            type="button"
            size="sm"
            data-ink-keep
            className="h-8 text-xs bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => runDue()}
            disabled={busyId === "batch"}
          >
            {busyId === "batch" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Mail className="h-3.5 w-3.5 mr-1" />
            )}
            Run due sequences
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {loading && (
          <div
            className="flex items-center gap-2 text-sm py-4 justify-center font-medium"
            data-ink-muted
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Computing with outcome
            ranking…
          </div>
        )}

        {!loading && showJobAction && jobAction && (
          <div
            className={`group rounded-xl border px-3 py-2 text-sm ${kindClass(jobAction.kind)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1">
                  <UserPlus className="h-3.5 w-3.5" />
                  {jobAction.label}
                </div>
                <p className="text-xs mt-0.5 font-medium" data-ink-muted>
                  {jobAction.reason}
                </p>
              </div>
              <DismissRowButton
                alwaysVisible
                label="Dismiss job action"
                onDismiss={() => dismiss(jobActionKey)}
                className="shrink-0 rounded p-1 hover:bg-black/5"
              />
            </div>
          </div>
        )}

        {!loading && visibleTop.length === 0 && !showJobAction && (
          <div
            className="text-sm text-center py-6 flex flex-col items-center gap-1 font-medium"
            data-ink-muted
          >
            <AlertCircle className="h-4 w-4" />
            {top.length > 0 || jobAction ? (
              <>
                <span>All next actions dismissed for now.</span>
                {dismissedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => clearFeed("job_next")}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Restore {dismissedCount}
                  </button>
                )}
              </>
            ) : (
              "No urgent actions — pipeline looks calm."
            )}
          </div>
        )}

        {!loading &&
          visibleTop.map((a, i) => {
            const enrollId = a.meta?.enrollmentId as string | undefined;
            return (
              <div
                key={`${a.candidateId}-${a.kind}-${i}`}
                className={`group rounded-xl border px-3 py-2 ${kindClass(a.kind)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {a.candidateName || a.candidateId?.slice(0, 8) || "Candidate"}
                      <span className="font-medium"> · {a.label}</span>
                    </div>
                    <p className="text-xs mt-0.5 leading-snug font-medium" data-ink-muted>
                      {a.reason}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 items-end">
                    {a.kind === "send_due_step" && enrollId && (
                      <Button
                        type="button"
                        size="sm"
                        data-ink-keep
                        className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white"
                        disabled={busyId === enrollId}
                        onClick={() => runDue(enrollId)}
                      >
                        {busyId === enrollId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            Run <ChevronRight className="h-3 w-3 ml-0.5" />
                          </>
                        )}
                      </Button>
                    )}
                    {a.kind === "mark_reply" && enrollId && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2"
                          disabled={!!busyId}
                          onClick={() => logReply(enrollId, "positive")}
                        >
                          + Reply
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2"
                          disabled={!!busyId}
                          onClick={() => logReply(enrollId, "negative")}
                        >
                          − No
                        </Button>
                      </div>
                    )}
                    {a.kind === "enroll_sequence" && a.candidateId && (
                      <Button
                        type="button"
                        size="sm"
                        data-ink-keep
                        className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={busyId === `enroll-${a.candidateId}`}
                        onClick={() =>
                          quickEnroll(a.candidateId!, a.candidateName)
                        }
                      >
                        {busyId === `enroll-${a.candidateId}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            Enroll <ChevronRight className="h-3 w-3 ml-0.5" />
                          </>
                        )}
                      </Button>
                    )}
                    {(a.kind === "revive_stale" || a.kind === "follow_up_task") &&
                      a.candidateId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={busyId === `enroll-${a.candidateId}`}
                          onClick={() =>
                            quickEnroll(a.candidateId!, a.candidateName)
                          }
                        >
                          Nudge
                        </Button>
                      )}
                    <DismissRowButton
                      alwaysVisible
                      label={`Dismiss ${a.candidateName || "action"}`}
                      onDismiss={() => dismiss(jobNextKey(jobId, a))}
                      className="shrink-0 rounded p-1 hover:bg-black/10"
                    />
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      </div>
    </section>
  );
}
