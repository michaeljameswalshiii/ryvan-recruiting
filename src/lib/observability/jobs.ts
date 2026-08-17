/**
 * Background job / cron visibility.
 * @serverOnly
 */

import type { JobHealth, OpsStatus } from "./types";
import { getCronHeartbeat } from "./store";
import { getPlatformAgentControls } from "@/lib/agents/platform-control";

export const CRON_CATALOG = [
  {
    id: "recruiter-agent-run",
    label: "Recruiter agent",
    schedule: "Every minute",
    path: "/api/cron/recruiter-agent-run",
    staleAfterMs: 5 * 60 * 1000,
  },
  {
    id: "list-builder-run",
    label: "List builder",
    schedule: "Every 5 minutes",
    path: "/api/cron/list-builder-run",
    staleAfterMs: 15 * 60 * 1000,
  },
  {
    id: "sequences-run",
    label: "Sequences",
    schedule: "Hourly",
    path: "/api/cron/sequences-run",
    staleAfterMs: 150 * 60 * 1000,
  },
  {
    id: "sequences-poll-replies",
    label: "Sequence replies",
    schedule: "Hourly at :30",
    path: "/api/cron/sequences-poll-replies",
    staleAfterMs: 150 * 60 * 1000,
  },
] as const;

export async function getJobHealth(): Promise<JobHealth[]> {
  const now = Date.now();
  const controls = await getPlatformAgentControls();
  return Promise.all(
    CRON_CATALOG.map(async (job) => {
      const enabled = controls.agents[job.id]?.enabled === true;
      const beat = await getCronHeartbeat(job.id);
      if (!enabled) {
        return {
          id: job.id,
          label: job.label,
          schedule: job.schedule,
          status: "unknown" as const,
          lastRunAt: beat?.lastRunAt,
          durationMs: beat?.durationMs,
          detail: "Schedule is off — manage in AI Agents",
          stale: false,
        };
      }
      if (!beat?.lastRunAt) {
        return {
          id: job.id,
          label: job.label,
          schedule: job.schedule,
          status: "unknown" as const,
          detail: "No heartbeat yet — will appear after the next scheduled run",
        };
      }
      const skipped = (beat.detail || "").includes("Schedule off");
      const age = now - Date.parse(beat.lastRunAt);
      const stale = !skipped && Number.isFinite(age) && age > job.staleAfterMs;
      let status: OpsStatus = beat.status === "error" ? "incident" : "healthy";
      if (stale && status === "healthy") status = "degraded";
      return {
        id: job.id,
        label: job.label,
        schedule: job.schedule,
        status,
        lastRunAt: beat.lastRunAt,
        durationMs: beat.durationMs,
        detail: stale
          ? `Last run is stale (${Math.round(age / 60000)} min ago)`
          : beat.detail || (beat.status === "ok" ? "Last run succeeded" : "Last run reported an error"),
        stale,
      };
    })
  );
}
