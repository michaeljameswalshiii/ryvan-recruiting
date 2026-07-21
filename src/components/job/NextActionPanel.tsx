"use client";

import { useCallback, useEffect, useState } from "react";
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

function kindColor(kind: string) {
  if (kind === "send_due_step") return "bg-emerald-50 border-emerald-200 text-emerald-900";
  if (kind === "enroll_sequence") return "bg-blue-50 border-blue-200 text-blue-900";
  if (kind === "submit") return "bg-violet-50 border-violet-200 text-violet-900";
  if (kind === "revive_stale") return "bg-amber-50 border-amber-200 text-amber-900";
  if (kind === "source_more") return "bg-sky-50 border-sky-200 text-sky-900";
  return "bg-slate-50 border-slate-200 text-slate-800";
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

  const top = actions.filter((a) => a.kind !== "none").slice(0, 12);

  return (
    <section
      className={`rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white shadow-sm ${className || ""}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-amber-100">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">
            Next actions
          </h3>
          {summary && (
            <span className="text-[11px] text-muted-foreground">
              {summary.urgent} urgent · {summary.due} due · {summary.enroll}{" "}
              enroll · {summary.stale} stale
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing with outcome
            ranking…
          </div>
        )}

        {!loading && jobAction && (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${kindColor(jobAction.kind)}`}
          >
            <div className="font-medium flex items-center gap-1">
              <UserPlus className="h-3.5 w-3.5" />
              {jobAction.label}
            </div>
            <p className="text-xs opacity-90 mt-0.5">{jobAction.reason}</p>
          </div>
        )}

        {!loading && top.length === 0 && !jobAction && (
          <div className="text-sm text-muted-foreground text-center py-6 flex flex-col items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            No urgent actions — pipeline looks calm.
          </div>
        )}

        {!loading &&
          top.map((a, i) => {
            const enrollId = a.meta?.enrollmentId as string | undefined;
            return (
              <div
                key={`${a.candidateId}-${a.kind}-${i}`}
                className={`rounded-xl border px-3 py-2 ${kindColor(a.kind)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {a.candidateName || a.candidateId?.slice(0, 8) || "Candidate"}
                      <span className="font-normal opacity-70">
                        {" "}
                        · {a.label}
                      </span>
                    </div>
                    <p className="text-xs opacity-90 mt-0.5 leading-snug">
                      {a.reason}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {a.kind === "send_due_step" && enrollId && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800"
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
                        className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700"
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
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
