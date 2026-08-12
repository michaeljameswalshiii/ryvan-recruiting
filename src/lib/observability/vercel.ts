/**
 * Optional live Vercel API snapshot. Works when VERCEL_TOKEN is set.
 * Always returns dashboard deep links even without a token.
 * @serverOnly
 */

import type { VercelSnapshot } from "./types";
import {
  vercelDeploymentUrl,
  vercelErrorLogsForPath,
  vercelLinks,
  vercelLogsForQuery,
} from "./links";

const PROJECT_ID =
  process.env.VERCEL_PROJECT_ID ||
  process.env.VERCEL_PROJECT_ID_OVERRIDE ||
  "prj_jYEi4oDtv2ENfBw7LgCq9PQV8zWy";

const TEAM_ID =
  process.env.VERCEL_ORG_ID ||
  process.env.VERCEL_TEAM_ID ||
  "team_VXOMemDJeIS4BNFXTzg11KVb";

function token(): string {
  return (
    process.env.VERCEL_TOKEN ||
    process.env.VERCEL_ACCESS_TOKEN ||
    process.env.VERCEL_API_TOKEN ||
    ""
  ).trim();
}

async function vercelGet<T>(path: string): Promise<T> {
  const auth = token();
  if (!auth) throw new Error("VERCEL_TOKEN is not configured");
  const url = path.startsWith("http")
    ? path
    : `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(TEAM_ID)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vercel ${res.status}: ${text.slice(0, 180)}`);
  }
  return (await res.json()) as T;
}

type DeploymentList = {
  deployments?: Array<{
    uid?: string;
    id?: string;
    url?: string;
    state?: string;
    readyState?: string;
    createdAt?: number;
    inspectorUrl?: string;
    meta?: {
      githubCommitSha?: string;
      githubCommitMessage?: string;
    };
  }>;
};

type RuntimeLog = {
  level?: string;
  message?: string;
  requestPath?: string;
  path?: string;
  responseStatusCode?: number;
  statusCode?: number;
  timestampInMs?: number;
  timestamp?: number | string;
};

function logTime(log: RuntimeLog): string {
  if (typeof log.timestampInMs === "number") {
    return new Date(log.timestampInMs).toISOString();
  }
  if (typeof log.timestamp === "number") {
    return new Date(log.timestamp).toISOString();
  }
  if (typeof log.timestamp === "string") return log.timestamp;
  return new Date().toISOString();
}

function envDeployment() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE || "";
  const url = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (!sha && !url) return undefined;
  return {
    url: url ? (url.startsWith("http") ? url : `https://${url}`) : undefined,
    state: process.env.VERCEL_ENV || "production",
    commit: sha ? sha.slice(0, 7) : undefined,
    commitMessage: message || undefined,
    inspectorUrl: vercelLinks().deployments,
  };
}

export async function getVercelSnapshot(range: string): Promise<VercelSnapshot> {
  const links = vercelLinks();
  const snapshot: VercelSnapshot = {
    configured: Boolean(token()),
    links,
    errorClusters: [],
    recentLogs: [],
    statusBreakdown: [],
    deployment: envDeployment(),
  };

  if (!token()) {
    snapshot.error =
      "Add VERCEL_TOKEN to pull live production logs into this page. Deep links still open the Vercel dashboards.";
    return snapshot;
  }

  try {
    const sinceHours = range === "1h" ? 1 : range === "6h" ? 6 : range === "7d" ? 168 : 24;
    const since = Date.now() - sinceHours * 60 * 60 * 1000;

    const deployments = await vercelGet<DeploymentList>(
      `/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&target=production&limit=5`
    );
    const latest = deployments.deployments?.[0];
    if (latest) {
      const id = latest.uid || latest.id;
      snapshot.deployment = {
        id,
        url: latest.url ? `https://${latest.url}` : snapshot.deployment?.url,
        state: latest.readyState || latest.state,
        createdAt: latest.createdAt
          ? new Date(latest.createdAt).toISOString()
          : undefined,
        commit:
          latest.meta?.githubCommitSha?.slice(0, 7) || snapshot.deployment?.commit,
        commitMessage:
          latest.meta?.githubCommitMessage || snapshot.deployment?.commitMessage,
        inspectorUrl: id ? vercelDeploymentUrl(id) : links.deployments,
      };

      if (id) {
        try {
          const logs = await vercelGet<{ logs?: RuntimeLog[] } | RuntimeLog[]>(
            `/v1/projects/${encodeURIComponent(PROJECT_ID)}/deployments/${encodeURIComponent(id)}/runtime-logs`
          );
          const rows = Array.isArray(logs) ? logs : logs.logs || [];
          const recent = rows
            .filter((row) => {
              const t = Date.parse(logTime(row));
              return !Number.isFinite(t) || t >= since;
            })
            .slice(-80)
            .reverse();

          const statusCounts = new Map<string, number>();
          const clusters = new Map<
            string,
            { name: string; count: number; path?: string; lastSeen?: string; sample?: string }
          >();

          for (const row of recent) {
            const path = row.requestPath || row.path || "/";
            const status = row.responseStatusCode ?? row.statusCode;
            const level = (row.level || (status && status >= 500 ? "error" : "info")).toLowerCase();
            const message = String(row.message || "").slice(0, 280);
            if (status) {
              const key = `${Math.floor(status / 100)}xx`;
              statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
            }
            if (level === "error" || level === "fatal" || (status && status >= 500)) {
              const name = message.split("\n")[0].slice(0, 120) || `HTTP ${status || "error"}`;
              const key = `${path}|${name}`;
              const prev = clusters.get(key);
              if (prev) {
                prev.count += 1;
                prev.lastSeen = logTime(row);
              } else {
                clusters.set(key, {
                  name,
                  count: 1,
                  path,
                  lastSeen: logTime(row),
                  sample: message,
                });
              }
              snapshot.recentLogs.push({
                t: logTime(row),
                level,
                path,
                status,
                message: message || "Error log",
                href: vercelErrorLogsForPath(path),
              });
            }
          }

          snapshot.recentLogs = snapshot.recentLogs.slice(0, 25);
          snapshot.errorClusters = Array.from(clusters.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 12)
            .map((cluster) => ({
              ...cluster,
              href: cluster.path
                ? vercelErrorLogsForPath(cluster.path)
                : vercelLogsForQuery(cluster.name),
            }));
          snapshot.statusBreakdown = Array.from(statusCounts.entries())
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => a.status.localeCompare(b.status));
        } catch (err) {
          snapshot.error = err instanceof Error ? err.message : "Runtime logs unavailable";
        }
      }
    }
  } catch (err) {
    snapshot.error = err instanceof Error ? err.message : "Vercel API unavailable";
  }

  return snapshot;
}
