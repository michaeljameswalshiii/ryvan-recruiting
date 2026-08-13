/**
 * Fire-and-forget Fit Score after a candidate is linked to a job.
 * Uses Next.js after() so the link response is not blocked; falls back
 * to a detached promise outside a request (MCP / scripts).
 */

type ScheduleInput = {
  tenantId: string;
  jobId: string;
  candidateId: string;
  createdBy?: string;
};

function fitKey(input: ScheduleInput) {
  return `${input.tenantId}:${input.jobId}:${input.candidateId}`;
}

const inflight = new Set<string>();

async function runFit(input: ScheduleInput) {
  const key = fitKey(input);
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const { getJobById } = await import("@/lib/db/repositories/job-repository");
    const { runPersistedFitScore } = await import(
      "@/lib/ai/run-persisted-fit-score"
    );
    const job = await getJobById(input.tenantId, input.jobId);
    if (!job) return;
    await runPersistedFitScore(input.tenantId, job, input.candidateId, {
      persist: true,
      createdBy: input.createdBy || "system",
      skipIfRecentMs: 120_000,
    });
  } catch (err) {
    console.warn("[auto-fit] score after link failed:", err);
  } finally {
    inflight.delete(key);
  }
}

/** Schedule scoring after the current response. Never throw to the caller. */
export function scheduleFitScoreOnLink(input: ScheduleInput) {
  if (!input.tenantId || !input.jobId || !input.candidateId) return;
  const start = () => {
    void runFit(input);
  };
  try {
    // Dynamically import so this module is safe from non-Next callers.
    void import("next/server")
      .then((mod) => {
        if (typeof mod.after === "function") {
          mod.after(start);
        } else {
          start();
        }
      })
      .catch(() => start());
  } catch {
    start();
  }
}
