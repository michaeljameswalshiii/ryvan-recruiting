import { NextRequest, NextResponse } from "next/server";
import { requireSiteAdminSession, isAdminAuthError } from "@/lib/admin-auth";
import type { OpsOverview, OpsRange, SeriesPoint } from "@/lib/observability/types";
import {
  getHourBuckets,
  getRecentErrors,
  getRecentEvents,
  listHourKeys,
} from "@/lib/observability/store";
import { getDependencyHealth } from "@/lib/observability/probes";
import { getJobHealth } from "@/lib/observability/jobs";
import { getVercelSnapshot } from "@/lib/observability/vercel";
import {
  buildInsights,
  buildRouteStats,
  decideStatus,
  percentile,
} from "@/lib/observability/insights";
import { rangeToMs } from "@/lib/observability/links";
import { getSession } from "@/lib/server-auth";
import { isSiteAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

function asRange(value: string | null): OpsRange {
  if (value === "1h" || value === "6h" || value === "7d") return value;
  return "24h";
}

function seriesFromHours(
  hours: Array<{
    hour: string;
    requests: number;
    errors: number;
    totalMs: number;
  }>
): SeriesPoint[] {
  return hours.map((hour) => {
    const date = new Date(`${hour.hour}:00:00.000Z`);
    return {
      t: hour.hour,
      label: Number.isNaN(date.getTime())
        ? hour.hour
        : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" }),
      requests: hour.requests,
      errors: hour.errors,
      avgMs: hour.requests ? Math.round(hour.totalMs / hour.requests) : 0,
    };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;

  const range = asRange(request.nextUrl.searchParams.get("range"));
  const rangeMs = rangeToMs(range);
  const since = Date.now() - rangeMs;

  const session = await getSession();
  const tenantId =
    session && isSiteAdmin(session.role)
      ? session.tenantScope && session.tenantScope !== "all"
        ? session.tenantScope
        : null
      : session?.tenantId || null;
  const scope = tenantId || "all";

  const hourKeys = listHourKeys(rangeMs);
  const [buckets, recentEvents, recentErrors, dependencies, jobs, vercel] =
    await Promise.all([
      getHourBuckets(hourKeys, scope),
      getRecentEvents(scope),
      getRecentErrors(scope),
      getDependencyHealth(),
      getJobHealth(),
      getVercelSnapshot(range),
    ]);

  const bucketByHour = new Map(buckets.map((b) => [b.hour, b]));
  const filled = hourKeys.map((hour) => {
    const bucket = bucketByHour.get(hour);
    return {
      hour,
      requests: bucket?.requests || 0,
      errors: bucket?.errors || 0,
      slow: bucket?.slow || 0,
      totalMs: bucket?.totalMs || 0,
      navCount: bucket?.navCount || 0,
      navTotalMs: bucket?.navTotalMs || 0,
      lcpCount: bucket?.lcpCount || 0,
      lcpTotal: bucket?.lcpTotal || 0,
    };
  });

  const requests = filled.reduce((sum, row) => sum + row.requests, 0);
  const errors = filled.reduce((sum, row) => sum + row.errors, 0);
  const slow = filled.reduce((sum, row) => sum + row.slow, 0);
  const totalMs = filled.reduce((sum, row) => sum + row.totalMs, 0);
  const navCount = filled.reduce((sum, row) => sum + row.navCount, 0);
  const navTotalMs = filled.reduce((sum, row) => sum + row.navTotalMs, 0);
  const lcpCount = filled.reduce((sum, row) => sum + row.lcpCount, 0);
  const lcpTotal = filled.reduce((sum, row) => sum + row.lcpTotal, 0);

  const windowEvents = recentEvents.filter((event) => Date.parse(event.t) >= since);
  const windowErrors = recentErrors.filter((event) => Date.parse(event.t) >= since);
  const apiSamples = windowEvents
    .filter((event) => event.kind === "api")
    .map((event) => Math.max(0, event.ms || 0));
  const routes = buildRouteStats(windowEvents);
  const p95Ms = percentile(apiSamples, 95);
  const errorRate = requests ? (errors / requests) * 100 : 0;
  const series = seriesFromHours(filled);
  const status = decideStatus({
    errorRate,
    errors,
    p95Ms,
    dependencies,
    jobs,
  });

  const vercelErrorFallback = vercel.recentLogs.map((log) => ({
    t: log.t,
    source: "server" as const,
    path: log.path,
    name: log.level.toUpperCase(),
    message: log.message,
    status: log.status,
    count: 1,
  }));

  const mergedErrors = (windowErrors.length ? windowErrors : vercelErrorFallback).slice(0, 25);

  const insights = buildInsights({
    range,
    requests,
    errors,
    errorRate,
    p95Ms,
    slow,
    routes,
    recentErrors: mergedErrors,
    dependencies,
    jobs,
    vercel,
    series,
  });

  const payload: OpsOverview = {
    generatedAt: new Date().toISOString(),
    range,
    scope,
    status: status.status,
    statusReason: status.reason,
    kpis: {
      requests,
      errors,
      errorRate: Number(errorRate.toFixed(2)),
      slow,
      avgMs: requests ? Math.round(totalMs / requests) : 0,
      p95Ms,
      navAvgMs: navCount ? Math.round(navTotalMs / navCount) : 0,
      lcpAvgMs: lcpCount ? Math.round(lcpTotal / lcpCount) : 0,
      sampleSize: apiSamples.length,
    },
    series,
    insights,
    routes: routes.slice(0, 16),
    errors: mergedErrors,
    dependencies,
    jobs,
    vercel,
    sources: {
      firstParty: requests > 0 || windowErrors.length > 0,
      vercel: vercel.configured && (!!vercel.recentLogs.length || !!vercel.deployment?.id),
      note: vercel.configured
        ? "Live Vercel logs plus first-party timings from people using Trio."
        : "First-party timings from Trio users. Use the Vercel buttons for the full production log stream.",
    },
  };

  return NextResponse.json(payload);
}
