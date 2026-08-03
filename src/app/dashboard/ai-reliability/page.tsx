"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Shield,
  Wrench,
} from "lucide-react";

type ToolStat = {
  calls: number;
  successes: number;
  failures: number;
  totalMs: number;
};

type AuditRow = {
  id: string;
  toolName: string;
  success: boolean;
  error?: string;
  durationMs: number;
  resultStatus?: string;
  paramsSummary?: string;
  createdAt: string;
  userId?: string;
};

function pct(successes: number, calls: number): string {
  if (!calls) return "—";
  return `${((successes / calls) * 100).toFixed(1)}%`;
}

function avgMs(totalMs: number, calls: number): string {
  if (!calls) return "—";
  return `${Math.round(totalMs / calls)} ms`;
}

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Light surface card — readable on dark theme canvas */
function LightCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-ink-on-light
      className={`rounded-2xl border border-gray-200 bg-white shadow-sm text-slate-900 ${className}`}
    >
      {children}
    </div>
  );
}

export default function AiReliabilityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Record<string, ToolStat>>({});
  const [recent, setRecent] = useState<AuditRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/tool-audit");
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) {
            setError(data.error || "Failed to load");
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setStats(data.stats || {});
          setRecent(Array.isArray(data.recent) ? data.recent : []);
          setUpdatedAt(data.updatedAt || null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Network error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = Object.entries(stats).sort(
    (a, b) => (b[1]?.calls || 0) - (a[1]?.calls || 0)
  );
  const totalCalls = rows.reduce((s, [, v]) => s + (v.calls || 0), 0);
  const totalSuccess = rows.reduce((s, [, v]) => s + (v.successes || 0), 0);
  const totalFail = rows.reduce((s, [, v]) => s + (v.failures || 0), 0);
  const failures = recent.filter((r) => !r.success);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Shield className="h-7 w-7 text-slate-600 dark:text-slate-200" />
            AI Reliability
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Tool call success rates, latency, and recent failures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/ai-assistant"
            className="inline-flex items-center h-9 px-3 rounded-md text-sm font-semibold border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
          >
            AI Assistant
          </Link>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center h-9 px-3 rounded-md text-sm font-semibold border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
          >
            AI Settings
          </Link>
        </div>
      </div>

      {loading && (
        <LightCard className="py-12">
          <div className="flex items-center gap-2 text-sm text-slate-600 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audit data…
          </div>
        </LightCard>
      )}

      {error && !loading && (
        <div
          data-ink-on-light
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <LightCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Total calls
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {totalCalls}
              </p>
            </LightCard>
            <LightCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Success rate
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {pct(totalSuccess, totalCalls)}
              </p>
            </LightCard>
            <LightCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Failures
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {totalFail}
              </p>
              {updatedAt && (
                <p className="text-xs text-slate-500 mt-2">
                  Stats updated {formatWhen(updatedAt)}
                </p>
              )}
            </LightCard>
          </div>

          <LightCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-slate-600" />
                Tool stats
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Per-tool call counts, success rate, and average latency
              </p>
            </div>
            <div className="p-5">
              {rows.length === 0 ? (
                <p className="text-sm text-slate-600 py-4 text-center">
                  No tool calls recorded yet. Use the AI Assistant to generate
                  audit data.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Tool</th>
                        <th className="px-3 py-2.5 font-semibold">Calls</th>
                        <th className="px-3 py-2.5 font-semibold">
                          Success rate
                        </th>
                        <th className="px-3 py-2.5 font-semibold">
                          Avg latency
                        </th>
                        <th className="px-3 py-2.5 font-semibold">Failures</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {rows.map(([name, s]) => (
                        <tr key={name} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-medium text-slate-900">
                            {name}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-800">
                            {s.calls}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            <span
                              className={
                                s.calls && s.successes / s.calls < 0.9
                                  ? "text-amber-700 font-semibold"
                                  : "text-emerald-700 font-medium"
                              }
                            >
                              {pct(s.successes, s.calls)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {avgMs(s.totalMs, s.calls)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-700">
                            {s.failures || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </LightCard>

          <LightCard className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Recent failures
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Latest failed tool executions (most recent first)
              </p>
            </div>
            <div className="p-5">
              {failures.length === 0 ? (
                <p className="text-sm text-slate-600 py-4 text-center">
                  No recent failures — looking good.
                </p>
              ) : (
                <ul className="space-y-3">
                  {failures.slice(0, 25).map((f) => (
                    <li
                      key={f.id}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {f.toolName}
                        </span>
                        <span className="text-xs text-slate-600">
                          {formatWhen(f.createdAt)} · {f.durationMs} ms
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-red-800 break-words">
                        {f.error || f.resultStatus || "Unknown error"}
                      </p>
                      {f.paramsSummary && (
                        <p className="mt-1 text-xs text-slate-600 font-mono truncate">
                          {f.paramsSummary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </LightCard>
        </>
      )}
    </div>
  );
}
