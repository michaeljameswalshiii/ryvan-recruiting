/**
 * Candidate activity focus filter — active-job timeline vs full history.
 */

/** Stages treated as closed / not “in play” for Focus view */
export const TERMINAL_JOB_STAGES = new Set([
  "rejected",
  "reject",
  "not_interested",
  "not-interested",
  "dnu",
  "placed",
  "accept",
  "accepted",
  "hired",
  "closed",
  "lost",
  "withdrawn",
]);

const FREE_NOTE_FOCUS_DAYS = 14;

export function normalizeStageKey(stage?: string | null): string {
  return String(stage || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isTerminalJobStage(stage?: string | null): boolean {
  const s = normalizeStageKey(stage);
  return TERMINAL_JOB_STAGES.has(s);
}

/** Linked jobs still “active” for focus filtering */
export function getActiveLinkedJobIds(
  linkedJobs: Array<{ jobId?: string; id?: string; stage?: string }> | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(linkedJobs)) return ids;
  for (const j of linkedJobs) {
    const id = String(j?.jobId || j?.id || "").trim();
    if (!id) continue;
    if (!isTerminalJobStage(j?.stage)) ids.add(id);
  }
  return ids;
}

export function getEventJobId(note: any): string | null {
  const meta = note?.metadata || {};
  const id = meta.jobId || meta.job_id || null;
  if (id) return String(id);
  return null;
}

/**
 * Focus = tied to an active linked job, OR free-form / unscoped activity
 * in the last FREE_NOTE_FOCUS_DAYS days.
 * Explicitly archived rows are never focus.
 */
export function isFocusActivity(
  note: any,
  activeJobIds: Set<string>,
  freeNoteDays: number = FREE_NOTE_FOCUS_DAYS
): boolean {
  const meta = note?.metadata || {};
  if (meta.archived === true || meta.archivedAt) return false;

  const jobId = getEventJobId(note);
  if (jobId) {
    return activeJobIds.has(jobId);
  }

  // No jobId: keep recent free-form / pipeline notes in Focus
  const ts = new Date(note?.createdAt || note?.timestamp || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return true; // unknown date → keep visible
  const cutoff = Date.now() - freeNoteDays * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

export function splitFocusAndArchived(
  rows: any[],
  activeJobIds: Set<string>
): { focus: any[]; archived: any[] } {
  const focus: any[] = [];
  const archived: any[] = [];
  for (const row of rows) {
    if (isFocusActivity(row, activeJobIds)) focus.push(row);
    else archived.push(row);
  }
  return { focus, archived };
}

export type ActivityViewMode = "focus" | "all";
