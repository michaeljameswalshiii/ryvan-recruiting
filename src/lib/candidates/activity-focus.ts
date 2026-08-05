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

/**
 * Note / action types that should never appear in Focus (closed outcomes).
 * Matched against noteType, noteTypeLabel, and display badge labels.
 */
export const TERMINAL_NOTE_TYPES = new Set([
  "rejected",
  "reject",
  "not_interested",
  "not interested",
  "dnu",
  "do not use",
  "placed",
  "accept",
  "accepted",
  "hired",
  "offer declined",
  "withdrawn",
  "unlinked",
  "job_unlinked",
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

/** True if this activity is a closed/negative outcome note type */
export function isTerminalNoteActivity(note: any): boolean {
  const meta = note?.metadata || {};
  const candidates = [
    meta.noteType,
    meta.noteTypeLabel,
    meta.systemKind,
    note?.eventType,
    note?.title,
  ]
    .filter(Boolean)
    .map((s) =>
      String(s)
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
    );

  for (const c of candidates) {
    if (TERMINAL_NOTE_TYPES.has(c)) return true;
    // "Note - Rejected", "Rejected", etc.
    if (c.includes("rejected") || c.includes("not interested")) return true;
    if (c === "dnu" || c.endsWith(" dnu") || c.startsWith("dnu ")) return true;
    if (c.includes("job unlinked") || c === "job_unlinked") return true;
  }

  const body = String(
    meta.noteText || note?.description || note?.title || ""
  ).toLowerCase();
  // Stage-driven reject notes often have type Rejected already; body alone is weaker
  if (meta.noteType || meta.noteTypeLabel) return false;
  if (/^rejected\b/.test(body) || body.startsWith("not interested")) {
    return true;
  }
  return false;
}

/**
 * Focus = tied to an active linked job (and not a terminal note type),
 * OR recent free-form notes that are not terminal outcomes.
 * Explicitly archived / Rejected / Not Interested / etc. are never Focus.
 */
export function isFocusActivity(
  note: any,
  activeJobIds: Set<string>,
  freeNoteDays: number = FREE_NOTE_FOCUS_DAYS
): boolean {
  const meta = note?.metadata || {};
  if (meta.archived === true || meta.archivedAt) return false;

  // Closed outcomes (Rejected, etc.) always go to archive — even if recent
  if (isTerminalNoteActivity(note)) return false;

  const jobId = getEventJobId(note);
  const body = String(
    meta.noteText || note?.description || note?.title || ""
  );
  const isAiFit =
    meta.systemKind === "ai_fit" ||
    typeof meta.fitScore === "number" ||
    /^ai fit for/i.test(body);
  const isJobAttach =
    meta.systemKind === "job_linked" ||
    meta.systemKind === "job_unlinked" ||
    note?.eventType === "JOB_LINKED" ||
    note?.eventType === "JOB_UNLINKED" ||
    /^linked to job:/i.test(body);

  // Job-scoped system rows only belong in Focus when that job is still active
  if (isAiFit || isJobAttach) {
    if (!jobId) return false;
    return activeJobIds.has(jobId);
  }

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
