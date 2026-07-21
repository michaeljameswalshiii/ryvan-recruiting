"use client";

import { useCallback, useEffect, useState } from "react";
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
import { toast } from "sonner";

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
  className?: string;
  limit?: number;
};

export function DeskNextActions({ compact, className, limit = 12 }: Props) {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [summary, setSummary] = useState<{
    due: number;
    enroll: number;
    urgent: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/desk/next-actions?limit=${limit}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        // Silent fail on compact strip
        if (!compact) toast.error(data.error || "Failed to load desk actions");
        return;
      }
      setActions(Array.isArray(data.actions) ? data.actions : []);
      setSummary(data.summary || null);
    } catch {
      if (!compact) toast.error("Failed to load desk actions");
    } finally {
      setLoading(false);
    }
  }, [limit, compact]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function quickEnroll(candidateId: string, jobId?: string, name?: string) {
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
          data.firstStepRan && data.runResult?.success ? " · first step sent" : ""
        }`
      );
      await load();
    } catch {
      toast.error("Enroll failed");
    } finally {
      setBusy(null);
    }
  }

  if (compact && !loading && actions.length === 0) {
    return null;
  }

  return (
    <section
      className={`rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/90 to-white ${
        compact ? "p-3" : "p-4 shadow-sm"
      } ${className || ""}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-slate-900">
            Desk next actions
          </span>
          {summary && (
            <span className="text-[11px] text-muted-foreground truncate">
              {summary.urgent} urgent · {summary.due} due · {summary.enroll}{" "}
              enroll
            </span>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {(summary?.due || 0) > 0 && (
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800"
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && actions.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">
          No urgent desk actions right now.
        </p>
      )}

      {!loading && actions.length > 0 && (
        <ul className={`space-y-1.5 ${compact ? "max-h-36" : "max-h-64"} overflow-y-auto`}>
          {actions.map((a, i) => {
            const enrollId = a.meta?.enrollmentId as string | undefined;
            const jobTitle = a.meta?.jobTitle as string | undefined;
            return (
              <li
                key={`${a.candidateId}-${a.kind}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-100/80 bg-white/80 px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {a.candidateName || a.candidateId?.slice(0, 8)}
                    <span className="font-normal text-slate-500">
                      {" "}
                      · {a.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {jobTitle ? `${jobTitle} · ` : ""}
                    {a.reason}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.kind === "send_due_step" && enrollId && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 text-[10px] px-2 bg-emerald-700 hover:bg-emerald-800"
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
                      className="h-6 text-[10px] px-2"
                      disabled={!!busy}
                      onClick={() =>
                        quickEnroll(a.candidateId!, a.jobId, a.candidateName)
                      }
                    >
                      <UserPlus className="h-3 w-3 mr-0.5" />
                      Enroll
                    </Button>
                  )}
                  {a.candidateId && (
                    <Link
                      href={`/dashboard/candidates/${a.candidateId}`}
                      title={`Open ${a.candidateName || "candidate"}`}
                      className="text-blue-600 hover:bg-blue-50 rounded p-0.5 inline-flex items-center"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
