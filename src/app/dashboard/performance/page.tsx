"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  Loader2,
  RefreshCw,
  Server,
  Timer,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OpsOverview, OpsRange, OpsStatus } from "@/lib/observability/types";

const RANGES: { key: OpsRange; label: string }[] = [
  { key: "1h", label: "1h" },
  { key: "6h", label: "6h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
];



function formatMs(ms?: number) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)} ms`;
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return formatWhen(iso);
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return formatWhen(iso);
}

function StatusPill({ status }: { status: OpsStatus | "unknown" }) {
  const label =
    status === "healthy"
      ? "Healthy"
      : status === "degraded"
        ? "Degraded"
        : status === "incident"
          ? "Incident"
          : "Unknown";
  const cls =
    status === "healthy"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "degraded"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : status === "incident"
          ? "bg-red-50 text-red-800 ring-red-200"
          : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-ink-on-light
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm text-slate-900 ${className}`}
    >
      {children}
    </section>
  );
}

function latencyClass(ms: number) {
  if (ms >= 2000) return "text-red-700 font-semibold";
  if (ms >= 800) return "text-amber-700 font-semibold";
  return "text-slate-800";
}

export default function OperationsHealthPage() {
  const [range, setRange] = useState<OpsRange>("24h");
  const [data, setData] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(true);

  const load = useCallback(async (nextRange = range) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/performance/overview?range=${nextRange}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Failed to load (${res.status})`);
        return;
      }
      setData(json as OpsOverview);
    } catch {
      setError("Network error loading operations data");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => void load(range), 30_000);
    return () => window.clearInterval(id);
  }, [auto, load, range]);

  const banner = useMemo(() => {
    const status = data?.status || "healthy";
    if (status === "incident") {
      return "bg-red-50 border-red-200 text-red-950";
    }
    if (status === "degraded") {
      return "bg-amber-50 border-amber-200 text-amber-950";
    }
    return "bg-emerald-50 border-emerald-200 text-emerald-950";
  }, [data?.status]);

  const kpis = data?.kpis;
  const vercel = data?.vercel;

  return (
    <div className="space-y-6 pb-10 text-slate-900">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Gauge className="h-7 w-7 text-orange-600" />
            Operations Health
          </h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            Production errors, slowdowns, dependency health, and scheduled jobs.
            Open Vercel whenever you need the raw request log.
            {data?.scope === "all" ? (
              <span className="ml-1 font-semibold text-violet-700">
                All Tenants — platform rollup across every workspace.
              </span>
            ) : data?.scope ? (
              <span className="ml-1 font-semibold text-slate-700">
                Scoped to the selected tenant.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                  range === item.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold shadow-sm">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto 30s
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          {vercel?.links.errorLogs && (
            <a
              href={vercel.links.errorLogs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Error logs
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {data && (
        <div data-ink-on-light className={`rounded-2xl border px-5 py-4 ${banner}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <StatusPill status={data.status} />
                <p className="text-lg font-semibold">
                  {data.status === "healthy"
                    ? "Production looks stable"
                    : data.status === "degraded"
                      ? "Something is off"
                      : "Needs attention now"}
                </p>
              </div>
              <p className="mt-1 text-sm opacity-80">{data.statusReason}</p>
            </div>
            <p className="text-xs opacity-70">
              Updated {formatWhen(data.generatedAt)} · {data.sources.note}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Error rate"
          value={kpis ? `${kpis.errorRate.toFixed(1)}%` : "—"}
          detail={kpis ? `${kpis.errors} errors / ${kpis.requests} requests` : "No samples yet"}
          tone={kpis && kpis.errorRate >= 5 ? "red" : kpis && kpis.errorRate >= 1 ? "amber" : "green"}
        />
        <Kpi
          label="API p95"
          value={formatMs(kpis?.p95Ms)}
          detail={kpis?.avgMs ? `Average ${formatMs(kpis.avgMs)}` : "From sampled API calls"}
          tone={kpis && kpis.p95Ms >= 2000 ? "red" : kpis && kpis.p95Ms >= 800 ? "amber" : "slate"}
        />
        <Kpi
          label="Slow calls"
          value={kpis ? String(kpis.slow) : "—"}
          detail="Requests over 2 seconds"
          tone={kpis && kpis.slow > 0 ? "amber" : "green"}
        />
        <Kpi
          label="Page load"
          value={formatMs(kpis?.navAvgMs)}
          detail={kpis?.lcpAvgMs ? `LCP ${formatMs(kpis.lcpAvgMs)}` : "Browser navigation"}
        />
        <Kpi
          label="Live deploy"
          value={vercel?.deployment?.commit || vercel?.deployment?.state || "prod"}
          detail={
            vercel?.deployment?.createdAt
              ? timeAgo(vercel.deployment.createdAt)
              : vercel?.deployment?.commitMessage || "Current production build"
          }
        />
      </div>

      {data?.insights?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.insights.map((insight) => (
            <Panel key={insight.title} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {insight.severity === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : insight.severity === "critical" ? (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    ) : (
                      <Zap className="h-4 w-4 text-amber-600" />
                    )}
                    {insight.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{insight.detail}</p>
                </div>
                {insight.href && (
                  <a
                    href={insight.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-700 hover:underline"
                  >
                    {insight.hrefLabel || "Open"}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </Panel>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="h-4 w-4 text-orange-600" />
              Traffic and errors
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              First-party samples collected from people using Trio
            </p>
          </div>
          <div className="h-64 p-4">
            {data?.series?.some((p) => p.requests || p.errors) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="requests" stroke="#334155" fill="#cbd5e1" name="Requests" />
                  <Area type="monotone" dataKey="errors" stroke="#b91c1c" fill="#fecaca" name="Errors" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart loading={loading} />
            )}
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Server className="h-4 w-4 text-orange-600" />
              Investigate in Vercel
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Full production history lives here
            </p>
          </div>
          <div className="space-y-2 p-4">
            {vercel &&
              [
                { label: "Runtime logs", href: vercel.links.logs, detail: "Every function request and console line" },
                { label: "Error logs only", href: vercel.links.errorLogs, detail: "Fatal and error level, production" },
                { label: "Observability", href: vercel.links.observability, detail: "Route latency, error rates, external calls" },
                { label: "Speed Insights", href: vercel.links.speedInsights, detail: "Real-user Core Web Vitals" },
                { label: "Deployments", href: vercel.links.deployments, detail: "Build health and rollback points" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 hover:border-orange-300 hover:bg-orange-50"
                >
                  <span>
                    <span className="block text-sm font-semibold">{link.label}</span>
                    <span className="block text-xs text-slate-500">{link.detail}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </a>
              ))}
            {vercel?.error && (
              <p className="px-1 pt-1 text-xs text-amber-700">{vercel.error}</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Error clusters
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Repeating failures, with a jump into the matching Vercel log
            </p>
          </div>
          <div className="overflow-x-auto p-4">
            {(data?.errors.length || 0) === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No clustered errors in this window.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2">Error</th>
                    <th className="pb-2">Path</th>
                    <th className="pb-2">Last seen</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data!.errors.map((item) => (
                    <tr key={`${item.name}-${item.path}-${item.t}`}>
                      <td className="py-2.5">
                        <p className="font-medium">{item.name}</p>
                        <p className="max-w-xs truncate text-xs text-slate-500" title={item.message}>
                          {item.message}
                        </p>
                      </td>
                      <td className="py-2.5 font-mono text-xs">{item.path}</td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {timeAgo(item.t)}
                        {item.count && item.count > 1 ? ` · ×${item.count}` : ""}
                      </td>
                      <td className="py-2.5 text-right">
                        <a
                          href={`${data!.vercel.links.errorLogs}&query=${encodeURIComponent(item.path)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-orange-700 hover:underline"
                        >
                          Logs
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Timer className="h-4 w-4 text-orange-600" />
              Slowest routes
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Where recruiters will feel the application stall
            </p>
          </div>
          <div className="overflow-x-auto p-4">
            {(data?.routes.length || 0) === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No API timings yet. Browse candidates, jobs, or texting, then refresh.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2">Route</th>
                    <th className="pb-2">p95</th>
                    <th className="pb-2">Calls</th>
                    <th className="pb-2">Errors</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data!.routes.map((route) => (
                    <tr key={route.path}>
                      <td className="max-w-[18rem] truncate py-2.5 font-medium" title={route.path}>
                        {route.path}
                      </td>
                      <td className={`py-2.5 tabular-nums ${latencyClass(route.p95Ms)}`}>
                        {formatMs(route.p95Ms)}
                      </td>
                      <td className="py-2.5 tabular-nums">{route.count}</td>
                      <td className={`py-2.5 tabular-nums ${route.errors ? "font-semibold text-red-700" : ""}`}>
                        {route.errors}
                      </td>
                      <td className="py-2.5 text-right">
                        <a
                          href={`${data!.vercel.links.logs}&query=${encodeURIComponent(route.path)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-orange-700 hover:underline"
                        >
                          Logs
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4 text-orange-600" />
              Dependencies
            </h2>
            <p className="mt-1 text-sm text-slate-600">Live probes and configuration checks</p>
          </div>
          <ul className="divide-y divide-slate-100 p-2">
            {data?.dependencies.map((dep) => (
              <li key={dep.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div>
                  <p className="font-medium">{dep.label}</p>
                  <p className="text-sm text-slate-600">{dep.detail}</p>
                </div>
                <div className="text-right">
                  <StatusPill status={dep.status} />
                  {dep.latencyMs != null && (
                    <p className="mt-1 text-xs tabular-nums text-slate-500">{formatMs(dep.latencyMs)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Clock3 className="h-4 w-4 text-orange-600" />
              Scheduled jobs
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Heartbeats written by each Vercel cron after it runs
            </p>
          </div>
          <ul className="divide-y divide-slate-100 p-2">
            {data?.jobs.map((job) => (
              <li key={job.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div>
                  <p className="font-medium">{job.label}</p>
                  <p className="text-xs text-slate-500">{job.schedule}</p>
                  <p className="mt-1 text-sm text-slate-600">{job.detail}</p>
                </div>
                <div className="text-right">
                  <StatusPill status={job.status} />
                  <p className="mt-1 text-xs text-slate-500">
                    {job.lastRunAt ? timeAgo(job.lastRunAt) : "not yet"}
                    {job.durationMs ? ` · ${formatMs(job.durationMs)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "green" | "amber" | "red";
}) {
  const tones = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div data-ink-on-light className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading samples…
        </span>
      ) : (
        "No traffic in this window yet. Use the app, then refresh."
      )}
    </div>
  );
}
