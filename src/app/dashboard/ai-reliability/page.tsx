"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
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
  tenantId?: string;
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
  const [scope, setScope] = useState<string>("");
  const [note, setNote] = useState("");
  const [tenantCount, setTenantCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/tool-audit", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error ||
            (res.status === 409
              ? "Select a customer tenant (or use All Tenants for platform-wide stats)."
              : `Failed to load (${res.status})`)
        );
        setStats({});
        setRecent([]);
        return;
      }
      setStats(data.stats || {});
      setRecent(Array.isArray(data.recent) ? data.recent : []);
      setUpdatedAt(data.updatedAt || null);
      setScope(data.scope || "tenant");
      setNote(typeof data.note === "string" ? data.note : "");
      setTenantCount(
        typeof data.tenantCount === "number" ? data.tenantCount : null
      );
    } catch {
      setError("Network error loading tool audit");
      setStats({});
      setRecent([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = Object.entries(stats).sort(
    (a, b) => (b[1]?.calls || 0) - (a[1]?.calls || 0)
  );
  const totalCalls = rows.reduce((s, [, v]) => s + (v.calls || 0), 0);
  const totalSuccess = rows.reduce((s, [, v]) => s + (v.successes || 0), 0);
  const totalFail = rows.reduce((s, [, v]) => s + (v.failures || 0), 0);
  const failures = recent.filter((r) => !r.success);
  const successes = recent.filter((r) => r.success);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900 dark:text-white">
            <Shield className="h-7 w-7 text-slate-600 dark:text-slate-200" />
            AI Reliability
          </h1>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            Tool call success rates, latency, and recent failures
            {scope === "all_tenants" ? (
              <span className="ml-1 font-semibold text-violet-700 dark:text-violet-300">
                · Platform-wide
                {tenantCount != null ? ` (${tenantCount} tenants)` : ""}
              </span>
            ) : null}
          </p>
          {note ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {note}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonRefresh onClick={() => void load()} loading={loading} />
          <Link
            href="/dashboard/general-ai-usage"
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            AI Assistant
          </Link>
          <Link
            href="/dashboard/settings"
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            AI Settings
          </Link>
        </div>
      </div>

      {loading && (
        <LightCard className="py-12">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
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
          <p className="font-semibold">{error}</p>
          <p className="mt-2 text-red-700">
            Tip: pick a customer tenant in the header (e.g. RYVAN), or stay on{" "}
            <strong>All Tenants</strong> for platform-wide stats. Then use the AI
            Assistant so tool calls get recorded.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 text-sm font-semibold text-red-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <LightCard className="p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Activity className="h-3.5 w-3.5" />
                Total calls
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {totalCalls}
              </p>
            </LightCard>
            <LightCard className="p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Success rate
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {pct(totalSuccess, totalCalls)}
              </p>
            </LightCard>
            <LightCard className="p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Failures
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {totalFail}
              </p>
              {updatedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Stats updated {formatWhen(updatedAt)}
                </p>
              )}
            </LightCard>
          </div>

          {totalCalls === 0 && (
            <LightCard className="p-6">
              <p className="text-sm text-slate-700">
                <strong>No tool audits yet</strong> for this scope. Open{" "}
                <Link
                  href="/dashboard/general-ai-usage"
                  className="font-semibold text-blue-700 underline"
                >
                  AI Assistant
                </Link>{" "}
                and run a request that uses tools (CRM search, create contact,
                etc.). Audits are written per tenant when tools execute.
              </p>
            </LightCard>
          )}

          <LightCard className="overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Wrench className="h-4 w-4 text-slate-600" />
                Tool stats
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Per-tool call counts, success rate, and average latency
              </p>
            </div>
            <div className="p-5">
              {rows.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-600">
                  No tool calls recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2.5">Tool</th>
                        <th className="px-3 py-2.5">Calls</th>
                        <th className="px-3 py-2.5">Success rate</th>
                        <th className="px-3 py-2.5">Avg latency</th>
                        <th className="px-3 py-2.5">Failures</th>
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
                                  ? "font-semibold text-amber-700"
                                  : "font-medium text-emerald-700"
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
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Recent failures
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Latest failed tool executions (most recent first)
              </p>
            </div>
            <div className="p-5">
              {failures.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-600">
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
                          {f.tenantId ? ` · ${f.tenantId}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-sm text-red-800">
                        {f.error || f.resultStatus || "Unknown error"}
                      </p>
                      {f.paramsSummary && (
                        <p className="mt-1 truncate font-mono text-xs text-slate-600">
                          {f.paramsSummary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </LightCard>

          {successes.length > 0 && (
            <LightCard className="overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">
                  Recent successful calls
                </h2>
              </div>
              <div className="p-5">
                <ul className="space-y-2">
                  {successes.slice(0, 15).map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-900">
                        {r.toolName}
                      </span>
                      <span className="text-xs text-slate-600">
                        {formatWhen(r.createdAt)} · {r.durationMs} ms
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </LightCard>
          )}
        </>
      )}
    </div>
  );
}

function ButtonRefresh({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Refresh
    </button>
  );
}
