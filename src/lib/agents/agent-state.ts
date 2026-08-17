/**
 * Live agent state + cost, even when the schedule is off.
 * @serverOnly
 */

import { scanItems, tableNames } from "@/lib/db/dynamodb";
import { getCronHeartbeat } from "@/lib/observability/store";
import { getRecentErrors } from "@/lib/observability/store";
import { errorFingerprint, getErrorFixLedger } from "./error-fix-store";
import type { RecruiterRun } from "@/lib/schemas/recruiter-run";
import {
  getPlatformAgentControls,
  PLATFORM_AGENTS,
  type PlatformAgentId,
} from "./platform-control";

export type AgentLifecycle =
  | "off"
  | "idle"
  | "queued"
  | "ready"
  | "error";

export type ManagedAgentView = {
  id: PlatformAgentId;
  label: string;
  kind: "cron" | "task";
  schedule: string;
  path: string;
  href: string;
  hrefLabel: string;
  summary: string;
  impact: string;
  capabilities: readonly string[];
  tasks: readonly { id: string; label: string; detail: string }[];
  enabled: boolean;
  state: AgentLifecycle;
  stateLabel: string;
  updatedAt?: string;
  updatedBy?: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastDetail?: string;
  lastDurationMs?: number;
  queue: Array<{ label: string; count: number }>;
  cost: {
    spentTodayUsd: number;
    spentMonthUsd: number;
    perRunUsd: number;
    estimateDayIfOnUsd: number;
    estimateMonthIfOnUsd: number;
    note: string;
  };
};

function dayStartIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStartIso() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function money(n: number) {
  return Math.round(Math.max(0, n) * 100) / 100;
}

async function recruiterSnapshot() {
  const empty = {
    queued: 0,
    running: 0,
    failed: 0,
    dayUsd: 0,
    monthUsd: 0,
  };
  try {
    const all = await scanItems<RecruiterRun>(
      tableNames.profiles,
      "#type = :type",
      { ":type": "recruiter_agent_run" },
      { "#type": "type" }
    );
    const day = dayStartIso();
    const month = monthStartIso();
    let dayUsd = 0;
    let monthUsd = 0;
    let failed = 0;
    let queued = 0;
    let running = 0;
    const now = Date.now();
    for (const run of all || []) {
      if (run.status === "failed") failed += 1;
      if (run.status === "queued") queued += 1;
      if (
        run.status === "running" &&
        (!run.lockedUntil || new Date(run.lockedUntil).getTime() < now)
      ) {
        running += 1;
      }
      const cost = Number(run.estimatedCostUsd || 0);
      if (run.updatedAt >= month) monthUsd += cost;
      if (run.updatedAt >= day) dayUsd += cost;
    }
    return {
      queued,
      running,
      failed,
      dayUsd: money(dayUsd),
      monthUsd: money(monthUsd),
    };
  } catch {
    return empty;
  }
}

async function listBuilderSnapshot() {
  try {
    const items = await scanItems<{ status?: string }>(
      tableNames.profiles,
      "#t = :t",
      { ":t": "list_builder" },
      { "#t": "type" }
    );
    const queued = (items || []).filter((j) => j.status === "queued").length;
    const running = (items || []).filter((j) => j.status === "running").length;
    return { queued, running };
  } catch {
    return { queued: 0, running: 0 };
  }
}

function lifecycle(input: {
  kind: "cron" | "task";
  enabled: boolean;
  queued: number;
  lastStatus?: string;
}): { state: AgentLifecycle; stateLabel: string } {
  if (input.kind === "task") {
    return { state: "ready", stateLabel: "Ready" };
  }
  if (!input.enabled) {
    if (input.queued > 0) {
      return {
        state: "queued",
        stateLabel: `Off · ${input.queued} waiting`,
      };
    }
    return { state: "off", stateLabel: "Off · idle" };
  }
  if (input.lastStatus === "error") {
    return { state: "error", stateLabel: "Error" };
  }
  if (input.queued > 0) {
    return { state: "queued", stateLabel: `${input.queued} queued` };
  }
  return { state: "idle", stateLabel: "On · idle" };
}

export async function listManagedAgentsWithState(): Promise<ManagedAgentView[]> {
  const [controls, errors, recruiter, lists, ledger] = await Promise.all([
    getPlatformAgentControls(),
    getRecentErrors().catch(() => []),
    recruiterSnapshot(),
    listBuilderSnapshot(),
    getErrorFixLedger(),
  ]);

  const views = await Promise.all(
    PLATFORM_AGENTS.map(async (agent) => {
      const sw = controls.agents[agent.id] || { enabled: false };
      const enabled = agent.kind === "cron" ? sw.enabled === true : true;
      const beat = await getCronHeartbeat(agent.id);

      let queue: Array<{ label: string; count: number }> = [];
      let spentTodayUsd = 0;
      let spentMonthUsd = 0;
      let estimateDayIfOnUsd = 0;
      let estimateMonthIfOnUsd = 0;
      let queued = 0;

      if (agent.id === "recruiter-agent-run") {
        queued = recruiter.queued + recruiter.running;
        queue = [
          { label: "Queued runs", count: recruiter.queued },
          { label: "Running", count: recruiter.running },
          { label: "Failed", count: recruiter.failed },
        ];
        spentTodayUsd = recruiter.dayUsd;
        spentMonthUsd = recruiter.monthUsd;
        estimateDayIfOnUsd = queued > 0 ? money(queued * agent.cost.perRunUsd) : 0;
        estimateMonthIfOnUsd =
          queued > 0 ? agent.cost.monthIfBusyUsd : 0;
      } else if (agent.id === "list-builder-run") {
        queued = lists.queued + lists.running;
        queue = [
          { label: "Queued jobs", count: lists.queued },
          { label: "Running", count: lists.running },
        ];
        estimateDayIfOnUsd = queued > 0 ? agent.cost.dayIfBusyUsd : 0;
        estimateMonthIfOnUsd = queued > 0 ? agent.cost.monthIfBusyUsd : 0;
      } else if (agent.id === "system-ops") {
        const known = new Set(
          (ledger.items || [])
            .filter((item) => item.status === "open_pr" || item.status === "merged")
            .map((item) => item.clusterKey)
        );
        const fresh = errors.filter((error) => !known.has(errorFingerprint(error))).length;
        const openPrs = (ledger.items || []).filter((item) => item.status === "open_pr").length;
        queue = [
          { label: "New", count: fresh },
          { label: "Open PRs", count: openPrs },
          { label: "Recorded errors", count: errors.length },
        ];
        queued = fresh;
      }

      const life = lifecycle({
        kind: agent.kind,
        enabled,
        queued,
        lastStatus: beat?.status,
      });

      return {
        id: agent.id,
        label: agent.label,
        kind: agent.kind,
        schedule: agent.schedule,
        path: agent.path,
        href: agent.href,
        hrefLabel: agent.hrefLabel,
        summary: agent.summary,
        impact: agent.impact,
        capabilities: agent.capabilities,
        tasks: agent.tasks,
        enabled,
        state: life.state,
        stateLabel: life.stateLabel,
        updatedAt: sw.updatedAt,
        updatedBy: sw.updatedBy,
        lastRunAt: beat?.lastRunAt,
        lastStatus: beat?.status,
        lastDetail: beat?.detail,
        lastDurationMs: beat?.durationMs,
        queue,
        cost: {
          spentTodayUsd,
          spentMonthUsd,
          perRunUsd: agent.cost.perRunUsd,
          estimateDayIfOnUsd,
          estimateMonthIfOnUsd,
          note: agent.cost.note,
        },
      } satisfies ManagedAgentView;
    })
  );

  return views;
}
