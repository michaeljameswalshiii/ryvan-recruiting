/**
 * Privileged System Admin tasks. No tenant CRM writes.
 * @serverOnly
 */

import {
  clearRecentErrors,
  clearRecentEvents,
  getRecentErrors,
  getCronHeartbeat,
} from "@/lib/observability/store";
import { getPlatformAgentControls, PLATFORM_AGENTS } from "./platform-control";
import { listRunnableRecruiterRuns } from "@/lib/db/repositories/recruiter-run-repository";
import { runErrorFixer } from "./error-fixer";

export type SystemTaskId =
  | "clean-errors"
  | "prune-samples"
  | "health-digest"
  | "fix-errors";

export async function runSystemTask(
  taskId: SystemTaskId
): Promise<{ ok: boolean; task: SystemTaskId; detail: string; data?: unknown }> {
  if (taskId === "clean-errors") {
    const before = await getRecentErrors();
    const cleared = await clearRecentErrors();
    return {
      ok: true,
      task: taskId,
      detail: `Cleared ${cleared} recorded error cluster${cleared === 1 ? "" : "s"}.`,
      data: { cleared, previous: before.length },
    };
  }

  if (taskId === "prune-samples") {
    const cleared = await clearRecentEvents();
    return {
      ok: true,
      task: taskId,
      detail: `Pruned ${cleared} performance sample${cleared === 1 ? "" : "s"}.`,
      data: { cleared },
    };
  }

  if (taskId === "health-digest") {
    const [errors, controls, recruiterQueue] = await Promise.all([
      getRecentErrors(),
      getPlatformAgentControls(),
      listRunnableRecruiterRuns().catch(() => []),
    ]);
    const schedules = await Promise.all(
      PLATFORM_AGENTS.filter((agent) => agent.kind === "cron").map(async (agent) => {
        const beat = await getCronHeartbeat(agent.id);
        return {
          id: agent.id,
          enabled: controls.agents[agent.id]?.enabled === true,
          lastRunAt: beat?.lastRunAt || null,
          lastDetail: beat?.detail || null,
        };
      })
    );
    const digest = {
      recordedErrors: errors.length,
      recruiterQueued: recruiterQueue.length,
      schedules,
      generatedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      task: taskId,
      detail: `${errors.length} recorded error${errors.length === 1 ? "" : "s"} · ${recruiterQueue.length} recruiter run${recruiterQueue.length === 1 ? "" : "s"} queued.`,
      data: digest,
    };
  }

  if (taskId === "fix-errors") {
    const result = await runErrorFixer();
    return {
      ok: result.ok,
      task: taskId,
      detail: result.detail,
      data: result,
    };
  }

  throw new Error("Unknown system task");
}
