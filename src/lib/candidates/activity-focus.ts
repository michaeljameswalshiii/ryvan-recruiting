/**
 * Candidate activity focus filter — active-job timeline vs full history.
 *
 * Focus = only open, non-closed jobs (no Rejected/Not Interested/etc. for that req).
 * Once a job has a closed outcome, ALL activity for that job leaves Focus.
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
 * Note / action types that mark a closed outcome (and the whole job thread).
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

export type LinkedJobLike = {
  jobId?: string;
  id?: string;
  stage?: string;
  jobTitle?: string;
  title?: string;
  companyName?: string;
};

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

export function jobRecordId(j: LinkedJobLike): string {
  return String(j?.jobId || j?.id || "").trim();
}

export function jobRecordTitle(j: LinkedJobLike): string {
  return String(j?.jobTitle || j?.title || "").trim();
}

/** Linked jobs still open by stage (before considering terminal notes) */
export function getActiveLinkedJobIds(
  linkedJobs: LinkedJobLike[] | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(linkedJobs)) return ids;
  for (const j of linkedJobs) {
    const id = jobRecordId(j);
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

function eventBody(note: any): string {
  const meta = note?.metadata || {};
  return String(meta.noteText || note?.description || note?.title || "");
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
    if (c.includes("rejected") || c.includes("not interested")) return true;
    if (c === "dnu" || c.endsWith(" dnu") || c.startsWith("dnu ")) return true;
    if (c.includes("job unlinked") || c === "job_unlinked") return true;
  }

  const body = eventBody(note).toLowerCase();
  if (meta.noteType || meta.noteTypeLabel) return false;
  if (/^rejected\b/.test(body) || body.startsWith("not interested")) {
    return true;
  }
  return false;
}

/** Match free-text / titles to a linked job id */
export function matchJobIdFromText(
  text: string,
  linkedJobs: LinkedJobLike[]
): string | null {
  const t = String(text || "").toLowerCase();
  if (!t || !Array.isArray(linkedJobs)) return null;

  let best: { id: string; len: number } | null = null;
  for (const j of linkedJobs) {
    const id = jobRecordId(j);
    const title = jobRecordTitle(j);
    if (!id || !title || title.length < 3) continue;
    const titleLower = title.toLowerCase();
    if (t.includes(titleLower)) {
      if (!best || titleLower.length > best.len) {
        best = { id, len: titleLower.length };
      }
    }
  }
  return best?.id || null;
}

/**
 * Job IDs that must leave Focus entirely:
 * - linked job stage is terminal, OR
 * - a terminal note (Rejected, etc.) with an explicit metadata.jobId
 *
 * Free-form Rejected text that merely *mentions* a job title is NOT enough
 * to archive the whole thread (e.g. “not moving forward … but asked about
 * Operations Specialist” must not hide Attached / AI fit for Ops).
 */
export function getClosedJobIds(
  rows: any[],
  linkedJobs: LinkedJobLike[] | null | undefined
): Set<string> {
  const closed = new Set<string>();
  const jobs = Array.isArray(linkedJobs) ? linkedJobs : [];

  for (const j of jobs) {
    const id = jobRecordId(j);
    if (id && isTerminalJobStage(j?.stage)) closed.add(id);
  }

  for (const note of rows) {
    if (!isTerminalNoteActivity(note)) continue;
    // Only explicit job linkage closes the whole req thread
    const jid = getEventJobId(note);
    if (jid) closed.add(jid);
  }

  return closed;
}

/**
 * Jobs still allowed in Focus = stage-active and not closed by outcome notes.
 */
export function getFocusJobIds(
  rows: any[],
  linkedJobs: LinkedJobLike[] | null | undefined
): Set<string> {
  const stageActive = getActiveLinkedJobIds(linkedJobs);
  const closed = getClosedJobIds(rows, linkedJobs);
  const focus = new Set<string>();
  for (const id of stageActive) {
    if (!closed.has(id)) focus.add(id);
  }
  return focus;
}

/**
 * Resolve which job (if any) this activity belongs to.
 */
export function resolveActivityJobId(
  note: any,
  linkedJobs: LinkedJobLike[] | null | undefined
): string | null {
  const jid = getEventJobId(note);
  if (jid) return jid;
  return matchJobIdFromText(
    eventBody(note),
    Array.isArray(linkedJobs) ? linkedJobs : []
  );
}

/**
 * Focus = activity for jobs still open & not closed by Rejected/etc.,
 * OR recent free-form notes that don't belong to a closed job.
 */
export function isFocusActivity(
  note: any,
  focusJobIds: Set<string>,
  closedJobIds: Set<string>,
  linkedJobs: LinkedJobLike[] | null | undefined,
  freeNoteDays: number = FREE_NOTE_FOCUS_DAYS
): boolean {
  const meta = note?.metadata || {};
  if (meta.archived === true || meta.archivedAt) return false;

  // Closed outcomes always archive (Rejected badge, etc.)
  if (isTerminalNoteActivity(note)) return false;

  const body = eventBody(note);
  const isAiFit =
    meta.systemKind === "ai_fit" ||
    typeof meta.fitScore === "number" ||
    /^ai fit for/i.test(body);
  const isJobAttach =
    meta.systemKind === "job_linked" ||
    meta.systemKind === "job_unlinked" ||
    note?.eventType === "JOB_LINKED" ||
    note?.eventType === "JOB_UNLINKED" ||
    /^linked to job:/i.test(body) ||
    /^attached to job:/i.test(body);

  // Prefer explicit jobId; for Attached/AI also match title so rows stay with the req
  let jobId = getEventJobId(note);
  if (!jobId && (isAiFit || isJobAttach)) {
    jobId = matchJobIdFromText(body, Array.isArray(linkedJobs) ? linkedJobs : []);
  } else if (!jobId) {
    jobId = resolveActivityJobId(note, linkedJobs);
  }

  // Whole thread for a closed job (stage terminal or Rejected with jobId) → archive
  if (jobId && closedJobIds.has(jobId)) return false;

  if (isAiFit || isJobAttach) {
    // Attached / AI fit: show in Focus when the job is still open
    if (!jobId) {
      // Can't map to a job — keep if recent so nothing important disappears
      const ts = new Date(note?.createdAt || note?.timestamp || 0).getTime();
      if (!Number.isFinite(ts) || ts <= 0) return true;
      const cutoff = Date.now() - freeNoteDays * 24 * 60 * 60 * 1000;
      return ts >= cutoff;
    }
    return focusJobIds.has(jobId);
  }

  if (jobId) {
    return focusJobIds.has(jobId);
  }

  // No resolvable job: recent free-form only (non-terminal)
  const ts = new Date(note?.createdAt || note?.timestamp || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return true;
  const cutoff = Date.now() - freeNoteDays * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

export function splitFocusAndArchived(
  rows: any[],
  linkedJobs: LinkedJobLike[] | null | undefined
): { focus: any[]; archived: any[]; focusJobIds: Set<string>; closedJobIds: Set<string> } {
  const closedJobIds = getClosedJobIds(rows, linkedJobs);
  const focusJobIds = getFocusJobIds(rows, linkedJobs);
  const focus: any[] = [];
  const archived: any[] = [];
  for (const row of rows) {
    if (isFocusActivity(row, focusJobIds, closedJobIds, linkedJobs)) {
      focus.push(row);
    } else {
      archived.push(row);
    }
  }
  return { focus, archived, focusJobIds, closedJobIds };
}

export type ActivityViewMode = "focus" | "all";
