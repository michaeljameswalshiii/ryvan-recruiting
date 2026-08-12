import type {
  DependencyHealth,
  JobHealth,
  OpsInsight,
  OpsRange,
  OpsStatus,
  RouteStat,
  SeriesPoint,
  StoredError,
  VercelSnapshot,
} from "./types";
import { vercelErrorLogsForPath, vercelLinks } from "./links";

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function buildRouteStats(
  events: Array<{ path: string; kind: string; status?: number; ms?: number }>
): RouteStat[] {
  const map = new Map<string, number[]>();
  const errors = new Map<string, number>();
  const slow = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "api" || !event.path) continue;
    const list = map.get(event.path) || [];
    list.push(Math.max(0, Math.round(event.ms || 0)));
    map.set(event.path, list);
    if ((event.status || 0) >= 500 || event.status === 0) {
      errors.set(event.path, (errors.get(event.path) || 0) + 1);
    }
    if ((event.ms || 0) >= 2000) {
      slow.set(event.path, (slow.get(event.path) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([path, samples]) => {
      const sum = samples.reduce((a, b) => a + b, 0);
      return {
        path,
        count: samples.length,
        errors: errors.get(path) || 0,
        slow: slow.get(path) || 0,
        avgMs: samples.length ? Math.round(sum / samples.length) : 0,
        p95Ms: percentile(samples, 95),
        maxMs: Math.max(...samples),
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms || b.errors - a.errors);
}

export function decideStatus(input: {
  errorRate: number;
  errors: number;
  p95Ms: number;
  dependencies: DependencyHealth[];
  jobs: JobHealth[];
}): { status: OpsStatus; reason: string } {
  const down = input.dependencies.filter((d) => d.status === "incident");
  const failedJobs = input.jobs.filter((j) => j.status === "incident");
  if (down.length || failedJobs.length || (input.errorRate >= 5 && input.errors >= 5)) {
    const parts = [
      down.length ? `${down.map((d) => d.label).join(", ")} down` : "",
      failedJobs.length ? `${failedJobs.map((j) => j.label).join(", ")} failed` : "",
      input.errorRate >= 5 && input.errors >= 5
        ? `error rate ${input.errorRate.toFixed(1)}%`
        : "",
    ].filter(Boolean);
    return { status: "incident", reason: parts.join(" · ") || "Active incident" };
  }

  const degradedDeps = input.dependencies.filter((d) => d.status === "degraded");
  const staleJobs = input.jobs.filter((j) => j.status === "degraded");
  if (
    input.errorRate >= 1 ||
    input.p95Ms >= 2000 ||
    degradedDeps.length ||
    staleJobs.length
  ) {
    const parts = [
      input.errorRate >= 1 ? `error rate ${input.errorRate.toFixed(1)}%` : "",
      input.p95Ms >= 2000 ? `p95 ${input.p95Ms} ms` : "",
      degradedDeps.length ? `${degradedDeps.map((d) => d.label).join(", ")} degraded` : "",
      staleJobs.length ? `${staleJobs.map((j) => j.label).join(", ")} stale` : "",
    ].filter(Boolean);
    return { status: "degraded", reason: parts.join(" · ") };
  }

  return { status: "healthy", reason: "No error spike, slowdown, or failed dependency" };
}

export function buildInsights(input: {
  range: OpsRange;
  requests: number;
  errors: number;
  errorRate: number;
  p95Ms: number;
  slow: number;
  routes: RouteStat[];
  recentErrors: StoredError[];
  dependencies: DependencyHealth[];
  jobs: JobHealth[];
  vercel: VercelSnapshot;
  series: SeriesPoint[];
}): OpsInsight[] {
  const links = vercelLinks();
  const insights: OpsInsight[] = [];
  const worst = input.routes.find((r) => r.errors > 0) || input.routes[0];
  const slowest = [...input.routes].sort((a, b) => b.p95Ms - a.p95Ms)[0];

  if (input.requests === 0 && !input.vercel.recentLogs.length) {
    insights.push({
      severity: "info",
      title: "Waiting on live traffic samples",
      detail:
        "This page now records real user API timing and errors as people use Trio. Until then, use Vercel Logs for the full production history.",
      href: links.errorLogs,
      hrefLabel: "Open Vercel error logs",
    });
  }

  if (input.errorRate >= 5 && input.errors >= 3) {
    insights.push({
      severity: "critical",
      title: `Error rate is ${input.errorRate.toFixed(1)}% in the selected window`,
      detail: worst
        ? `${input.errors} failing requests. Start with ${worst.path} (${worst.errors} errors).`
        : `${input.errors} failing requests in this window.`,
      href: worst ? vercelErrorLogsForPath(worst.path) : links.errorLogs,
      hrefLabel: "Inspect error logs",
    });
  } else if (input.errorRate >= 1 && input.errors >= 2) {
    insights.push({
      severity: "warn",
      title: "Elevated application errors",
      detail: `${input.errors} errors across ${input.requests} sampled requests. Users will see failed saves or empty screens.`,
      href: links.errorLogs,
      hrefLabel: "Open error logs",
    });
  }

  if (slowest && slowest.p95Ms >= 2000 && slowest.count >= 3) {
    insights.push({
      severity: slowest.p95Ms >= 5000 ? "critical" : "warn",
      title: `${slowest.path} is slow`,
      detail: `p95 ${slowest.p95Ms} ms across ${slowest.count} calls${slowest.slow ? ` · ${slowest.slow} over 2s` : ""}. This is the first place users will feel a stall.`,
      href: `${links.observability}`,
      hrefLabel: "Open Vercel Observability",
    });
  } else if (input.p95Ms >= 2000) {
    insights.push({
      severity: "warn",
      title: `API p95 is ${input.p95Ms} ms`,
      detail: `${input.slow} sampled requests took longer than 2 seconds.`,
      href: links.observability,
      hrefLabel: "Open Vercel Observability",
    });
  }

  for (const dep of input.dependencies.filter((d) => d.status !== "healthy")) {
    insights.push({
      severity: dep.status === "incident" ? "critical" : "warn",
      title: `${dep.label} is ${dep.status === "incident" ? "down" : "degraded"}`,
      detail: dep.detail,
    });
  }

  for (const job of input.jobs.filter((j) => j.status === "incident" || j.stale)) {
    insights.push({
      severity: job.status === "incident" ? "critical" : "warn",
      title: `${job.label} cron needs attention`,
      detail: job.detail || "Scheduled job is late or failing.",
    });
  }

  const topError = input.recentErrors[0];
  if (topError && (topError.count || 1) >= 2) {
    insights.push({
      severity: "warn",
      title: `Repeating error: ${topError.name}`,
      detail: `${topError.count || 1} times on ${topError.path}. ${topError.message}`,
      href: vercelErrorLogsForPath(topError.path),
      hrefLabel: "View this path in Vercel",
    });
  }

  if (input.vercel.deployment?.state && /error|failed|canceled/i.test(input.vercel.deployment.state)) {
    insights.push({
      severity: "critical",
      title: "Latest production deployment is not healthy",
      detail: input.vercel.deployment.commitMessage || input.vercel.deployment.state,
      href: input.vercel.deployment.inspectorUrl || links.deployments,
      hrefLabel: "Open deployment",
    });
  }

  if (!insights.some((i) => i.severity === "critical" || i.severity === "warn")) {
    insights.push({
      severity: "ok",
      title: "No active performance incident",
      detail: `Sampled error rate ${pct(input.errors, input.requests).toFixed(1)}% · p95 ${input.p95Ms || 0} ms. Keep Vercel Logs open if you need the raw request stream.`,
      href: links.logs,
      hrefLabel: "Open runtime logs",
    });
  }

  return insights.slice(0, 6);
}
