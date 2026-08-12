const TEAM =
  process.env.NEXT_PUBLIC_VERCEL_TEAM_SLUG ||
  process.env.VERCEL_TEAM_SLUG ||
  "michaeljameswalshiiis-projects";

const PROJECT =
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_SLUG ||
  process.env.VERCEL_PROJECT_SLUG ||
  "turnkey-optimization";

export function vercelProjectBase(): string {
  const override = (process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL || "").replace(
    /\/$/,
    ""
  );
  if (
    override &&
    /vercel\.com\//.test(override) &&
    !/vercel\.com\/dashboard\/?$/.test(override)
  ) {
    return override;
  }
  return `https://vercel.com/${TEAM}/${PROJECT}`;
}

export function vercelLinks() {
  const base = vercelProjectBase();
  return {
    logs: `${base}/logs?environments=production`,
    errorLogs: `${base}/logs?environments=production&levels=error,fatal`,
    observability: `${base}/observability`,
    speedInsights: `${base}/speed-insights`,
    deployments: `${base}/deployments`,
    runtime: `${base}/observability/runtime`,
  };
}

export function vercelLogsForPath(path: string, range: string = "24h"): string {
  const base = vercelProjectBase();
  const q = encodeURIComponent(path);
  return `${base}/logs?environments=production&query=${q}&since=${encodeURIComponent(range)}`;
}

export function vercelErrorLogsForPath(path: string): string {
  const base = vercelProjectBase();
  const q = encodeURIComponent(path);
  return `${base}/logs?environments=production&levels=error,fatal&query=${q}`;
}

export function vercelLogsForQuery(query: string): string {
  const base = vercelProjectBase();
  return `${base}/logs?environments=production&query=${encodeURIComponent(query)}`;
}

export function vercelDeploymentUrl(deploymentId?: string): string {
  const base = vercelProjectBase();
  if (!deploymentId) return `${base}/deployments`;
  return `${base}/${deploymentId}`;
}

export function normalizePath(raw?: string | null): string {
  if (!raw) return "/";
  let value = String(raw).trim();
  if (!value) return "/";
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      value = new URL(value).pathname;
    }
  } catch {
    value = value.split("?")[0] || "/";
  }
  const q = value.indexOf("?");
  if (q >= 0) value = value.slice(0, q);
  const hash = value.indexOf("#");
  if (hash >= 0) value = value.slice(0, hash);
  value = value.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ":id"
  );
  value = value.replace(/\/[0-9a-f]{16,}\b/gi, "/:id");
  value = value.replace(/\/\d{5,}\b/g, "/:id");
  if (!value.startsWith("/")) value = `/${value}`;
  return value.slice(0, 180) || "/";
}

export function rangeToMs(range: string): number {
  if (range === "1h") return 60 * 60 * 1000;
  if (range === "6h") return 6 * 60 * 60 * 1000;
  if (range === "7d") return 7 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function hourKey(date = new Date()): string {
  const iso = date.toISOString();
  return iso.slice(0, 13);
}

export function hourBucketId(hour: string, tenantId?: string | null): string {
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  return `ops-hour#${scope}#${hour}`;
}

/** Pre-tenant global hour key (still read for All Tenants history). */
export function legacyHourBucketId(hour: string): string {
  return `ops-hour#${hour}`;
}

export function recentEventsId(tenantId?: string | null): string {
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  return `ops-events#${scope}`;
}

export function recentErrorsId(tenantId?: string | null): string {
  const scope = tenantId && tenantId !== "all" ? tenantId : "all";
  return `ops-errors#${scope}`;
}
