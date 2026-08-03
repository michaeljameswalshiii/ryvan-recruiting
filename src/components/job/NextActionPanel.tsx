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

/** Solid pastel + dark ink (inline) — avoids dark-mode utility remaps */
function kindStyle(kind: string): { backgroundColor: string; borderColor: string; color: string } {
  if (kind === "send_due_step")
    return { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", color: "#064e3b" };
  if (kind === "enroll_sequence")
    return { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", color: "#1e3a8a" };
  if (kind === "submit")
    return { backgroundColor: "#f5f3ff", borderColor: "#ddd6fe", color: "#4c1d95" };
  if (kind === "revive_stale")
    return { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#78350f" };
  if (kind === "source_more")
    return { backgroundColor: "#f0f9ff", borderColor: "#bae6fd", color: "#0c4a6e" };
  // advance pipeline / default — white card, near-black ink
  return { backgroundColor: "#ffffff", borderColor: "#e2e8f0", color: "#0f172a" };
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

  // Solid light panel + forced dark ink (gradients skip global light-surface CSS)
  const ink = { color: "#0f172a" } as const;
  const muted = { color: "#475569" } as const;

  return (
    <section
      className={`rounded-2xl border border-amber-200 shadow-sm ${className || ""}`}
      style={{ backgroundColor: "#fffbeb", color: "#0f172a" }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: "#fde68a" }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Zap className="h-4 w-4 shrink-0" style={{ color: "#d97706" }} />
          <h3 className="text-sm font-semibold" style={ink}>
            Next actions
          </h3>
          {summary && (
            <span className="text-[11px] font-medium" style={muted}>
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
              style={muted}
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
              style={muted}
              title="Dismiss all visible next actions for 30 days"
            >
              Dismiss
            </button>
          )}
          <Button
            type="button"
            size="sm"
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
            style={ink}
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              style={ink}
            />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {loading && (
          <div
            className="flex items-center gap-2 text-sm py-4 justify-center font-medium"
            style={muted}
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Computing with outcome
            ranking…
          </div>
        )}

        {!loading && showJobAction && jobAction && (
          <div
            className="group rounded-xl border px-3 py-2 text-sm"
            style={kindStyle(jobAction.kind)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1">
                  <UserPlus className="h-3.5 w-3.5" />
                  {jobAction.label}
                </div>
                <p className="text-xs mt-0.5 font-medium" style={{ opacity: 0.92 }}>
                  {jobAction.reason}
                </p>
              </div>
              <DismissRowButton
                alwaysVisible
                label="Dismiss job action"
                onDismiss={() => dismiss(jobActionKey)}
                className="shrink-0 rounded p-1 text-slate-700 hover:bg-black/5"
              />
            </div>
          </div>
        )}

        {!loading && visibleTop.length === 0 && !showJobAction && (
          <div
            className="text-sm text-center py-6 flex flex-col items-center gap-1 font-medium"
            style={muted}
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
            const rowStyle = kindStyle(a.kind);
            return (
              <div
                key={`${a.candidateId}-${a.kind}-${i}`}
                className="group rounded-xl border px-3 py-2"
                style={rowStyle}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: rowStyle.color }}>
                      {a.candidateName || a.candidateId?.slice(0, 8) || "Candidate"}
                      <span className="font-medium" style={{ color: rowStyle.color, opacity: 0.85 }}>
                        {" "}
                        · {a.label}
                      </span>
                    </div>
                    <p
                      className="text-xs mt-0.5 leading-snug font-medium"
                      style={{ color: rowStyle.color, opacity: 0.9 }}
                    >
                      {a.reason}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 items-end">
                    {a.kind === "send_due_step" && enrollId && (
                      <Button
                        type="button"
                        size="sm"
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
                          className="h-7 text-[11px] px-2 border-slate-300 text-slate-800"
                          disabled={!!busyId}
                          onClick={() => logReply(enrollId, "positive")}
                        >
                          + Reply
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2 border-slate-300 text-slate-800"
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
                          className="h-7 text-[11px] border-slate-300 text-slate-800"
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
                      className="shrink-0 rounded p-1 text-slate-800 hover:bg-black/10"
                    />
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
