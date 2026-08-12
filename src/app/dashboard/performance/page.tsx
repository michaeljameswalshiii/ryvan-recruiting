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
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";

type DbHealth = { status?: string; latencyMs?: number; table?: string; error?: string };
type ApiTiming = { name: string; duration: number; status: string; size?: number };
type UiMetrics = { navigationMs: number; domContentLoadedMs: number; apiRequests: number; apiFailures: number; apiAverageMs: number; errors: number };

const vercelBase = (process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL || "https://vercel.com/dashboard").replace(/\/$/, "");
const vercelLinks = [
  { label: "Runtime logs", href: `${vercelBase}/logs`, description: "Request errors, status codes, and server output" },
  { label: "Observability", href: `${vercelBase}/observability`, description: "Route latency, error rates, functions, and external calls" },
  { label: "Speed Insights", href: `${vercelBase}/speed-insights`, description: "Real-user browser performance and Core Web Vitals" },
  { label: "Deployments", href: `${vercelBase}/deployments`, description: "Build health, deploy history, and rollback points" },
];

function Metric({ label, value, detail, tone = "slate" }: { label: string; value: string; detail: string; tone?: "slate" | "green" | "amber" | "red" }) {
  const tones = { slate: "text-slate-900", green: "text-emerald-700", amber: "text-amber-700", red: "text-red-700" };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold tabular-nums ${tones[tone]}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm">{children}</section>;
}

function collectUiMetrics(): { metrics: UiMetrics; resources: ApiTiming[] } {
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const api = resources.filter((entry) => entry.name.includes("/api/")).map((entry) => ({
    name: new URL(entry.name).pathname,
    duration: Math.round(entry.duration),
    status: "completed",
    size: entry.transferSize,
  })).sort((a, b) => b.duration - a.duration).slice(0, 20);
  const errors = Number(sessionStorage.getItem("turnkey-ui-errors") || "0");
  const apiDuration = api.reduce((sum, item) => sum + item.duration, 0);
  return {
    metrics: {
      navigationMs: Math.round(navigation?.duration || performance.now()),
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0),
      apiRequests: api.length,
      apiFailures: 0,
      apiAverageMs: api.length ? Math.round(apiDuration / api.length) : 0,
      errors,
    },
    resources: api,
  };
}

export default function PerformancePage() {
  const [ui, setUi] = useState<UiMetrics>({ navigationMs: 0, domContentLoadedMs: 0, apiRequests: 0, apiFailures: 0, apiAverageMs: 0, errors: 0 });
  const [resources, setResources] = useState<ApiTiming[]>([]);
  const [database, setDatabase] = useState<DbHealth>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const started = performance.now();
    try {
      const response = await fetch("/api/performance/health", { cache: "no-store" });
      const data = await response.json();
      setDatabase({ ...data, latencyMs: data.latencyMs || Math.round(performance.now() - started) });
    } catch {
      setDatabase({ status: "unhealthy", error: "Database health endpoint unavailable" });
    }
    const snapshot = collectUiMetrics();
    setUi(snapshot.metrics);
    setResources(snapshot.resources);
    setLoading(false);
  }, []);

  useEffect(() => {
    const onError = () => {
      const count = Number(sessionStorage.getItem("turnkey-ui-errors") || "0") + 1;
      sessionStorage.setItem("turnkey-ui-errors", String(count));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    void load();
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onError); };
  }, [load]);

  const dbOk = database.status === "healthy";
  const apiFailureTone = ui.apiFailures ? "red" : "green";
  const slowest = useMemo(() => resources.slice(0, 8), [resources]);

  return <div className="space-y-6 pb-10 text-slate-900">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="flex items-center gap-2 text-3xl font-bold"><Gauge className="h-7 w-7 text-orange-600" />System Performance</h1><p className="mt-1 text-slate-600">Non-AI performance for the application UI, API actions, and database.</p><p className="mt-1 text-xs text-slate-500">UI metrics reflect this browser session. Vercel Observability provides historical, all-user route metrics.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Page load" value={ui.navigationMs ? `${ui.navigationMs} ms` : "—"} detail="Browser navigation duration" /><Metric label="DOM ready" value={ui.domContentLoadedMs ? `${ui.domContentLoadedMs} ms` : "—"} detail="Time until page DOM was ready" /><Metric label="API average" value={ui.apiAverageMs ? `${ui.apiAverageMs} ms` : "—"} detail={`${ui.apiRequests} API requests observed`} tone={apiFailureTone} /><Metric label="UI errors" value={String(ui.errors)} detail="This browser session" tone={ui.errors ? "red" : "green"} /></div>

    <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><Panel><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4 text-orange-600" />Slowest API actions in this session</h2><p className="mt-1 text-sm text-slate-600">Captured from browser resource timings. Use Vercel Observability for production history and failure rates.</p></div><div className="overflow-x-auto p-5">{slowest.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No API timings captured yet. Navigate through the app and refresh.</p> : <table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3">Endpoint</th><th className="pb-3">Duration</th><th className="pb-3">Transfer</th></tr></thead><tbody className="divide-y divide-slate-100">{slowest.map((item) => <tr key={`${item.name}-${item.duration}`}><td className="max-w-[34rem] truncate py-3 font-medium" title={item.name}>{item.name}</td><td className={`py-3 tabular-nums font-semibold ${item.duration > 1000 ? "text-red-700" : item.duration > 500 ? "text-amber-700" : "text-slate-700"}`}>{item.duration} ms</td><td className="py-3 tabular-nums text-slate-500">{item.size ? `${Math.round(item.size / 1024)} KB` : "—"}</td></tr>)}</tbody></table>}</div></Panel>
      <Panel><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><Database className="h-4 w-4 text-orange-600" />Database health</h2><p className="mt-1 text-sm text-slate-600">Live DynamoDB round-trip check.</p></div><div className="p-5"><div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3"><div className="flex items-center gap-2">{dbOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}<span className="font-medium">DynamoDB</span></div><span className={`text-xs font-semibold ${dbOk ? "text-emerald-700" : "text-red-700"}`}>{database.latencyMs ? `${database.latencyMs} ms` : database.status || "unavailable"}</span></div>{database.table && <p className="mt-3 text-xs text-slate-500">Probe table: {database.table}</p>}{database.error && <p className="mt-3 break-words text-xs text-red-700">{database.error}</p>}</div></Panel></div>

    <Panel><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><Server className="h-4 w-4 text-orange-600" />Production observability</h2><p className="mt-1 text-sm text-slate-600">Use Vercel for historical endpoint latency, errors, function duration, and real-user UI performance.</p></div><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">{vercelLinks.map(link => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="group rounded-lg border border-slate-200 p-3 hover:border-orange-300 hover:bg-orange-50"><div className="flex items-center justify-between"><span className="font-semibold">{link.label}</span><ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600" /></div><p className="mt-1 text-xs leading-5 text-slate-600">{link.description}</p></a>)}</div></Panel>

    <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />Page load and API timings are measured in the browser; database timing is measured by the server.</div>
  </div>;
}
