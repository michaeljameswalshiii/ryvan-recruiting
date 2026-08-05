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

/** Match free-text / titles to a linked job id (longest title wins). */
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

/** Clauses that name a *different* opportunity (not the subject of a Rejected note). */
const DIFFERENT_OPPORTUNITY_PATTERNS = [
  /different opportunity[:\s—–-]+([^\n.;]+)/gi,
  /another opportunity[:\s—–-]+([^\n.;]+)/gi,
  /different role[:\s—–-]+([^\n.;]+)/gi,
  /other opportunity[:\s—–-]+([^\n.;]+)/gi,
  /alternative(?: opportunity| role)?[:\s—–-]+([^\n.;]+)/gi,
  /instead (?:for|about|on)\s+([^\n.;]+)/gi,
  /inquire(?:d)? about (?:a |the )?([^\n.;]+)/gi,
  /did inquire about a different opportunity[:\s—–-]+([^\n.;]+)/gi,
];

/**
 * Strip "different opportunity …" clauses so title matching does not treat the
 * *other* role as the subject of this note.
 */
export function stripDifferentOpportunityClauses(text: string): string {
  let out = String(text || "");
  for (const re of DIFFERENT_OPPORTUNITY_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Jobs named as a *different / other / alternative* opportunity in free text
 * (still in play — should stay in Focus).
 */
export function extractDifferentOpportunityJobIds(
  text: string,
  linkedJobs: LinkedJobLike[]
): Set<string> {
  const protectedIds = new Set<string>();
  const jobs = Array.isArray(linkedJobs) ? linkedJobs : [];
  if (!text || !jobs.length) return protectedIds;

  for (const re of DIFFERENT_OPPORTUNITY_PATTERNS) {
    const local = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      const chunk = m[1] || "";
      const id = matchJobIdFromText(chunk, jobs);
      if (id) protectedIds.add(id);
    }
  }
  return protectedIds;
}

/**
 * Job IDs that must leave Focus entirely:
 * - linked job stage is terminal, OR
 * - terminal note with explicit metadata.jobId, OR
 * - free-form Rejected that names a "different opportunity" → close all *other* linked jobs
 *   (the named opportunity stays open; e.g. Finance rejected, Ops still in play)
 * - free-form Rejected with a clear job title match and no protected opportunity
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

    const jid = getEventJobId(note);
    if (jid) {
      closed.add(jid);
      continue;
    }

    const body = eventBody(note);
    const protectedIds = extractDifferentOpportunityJobIds(body, jobs);

    if (protectedIds.size > 0) {
      // “Not moving forward on this role … different opportunity – Ops”
      // → close every other linked job (Finance, etc.), keep Ops open
      for (const j of jobs) {
        const id = jobRecordId(j);
        if (id && !protectedIds.has(id)) closed.add(id);
      }
      continue;
    }

    // No “different opportunity” clause: title match closes that one job only
    const matched = matchJobIdFromText(body, jobs);
    if (matched) closed.add(matched);
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

export type ResolvedJobTag = {
  jobId: string | null;
  jobTitle: string | null;
  companyName: string | null;
  /** Single chip label: "Title @ Company" or "Title" */
  label: string | null;
};

function enrichFromJob(
  j: LinkedJobLike | undefined,
  jobTitle: string | null,
  companyName: string | null
): { jobTitle: string | null; companyName: string | null } {
  if (!j) return { jobTitle, companyName };
  return {
    jobTitle: jobTitle || jobRecordTitle(j) || null,
    companyName:
      companyName ||
      String(
        (j as any).companyName || (j as any).company_name || ""
      ).trim() ||
      null,
  };
}

/**
 * Resolve a consistent job tag for display on any activity row.
 * Uses stored metadata first, then body/title matching against linked jobs.
 *
 * Important: on Rejected / terminal notes, a job named only as a
 * "different opportunity" is *not* the subject — tag the closed role instead.
 */
export function resolveActivityJobTag(
  note: any,
  linkedJobs: LinkedJobLike[] | null | undefined
): ResolvedJobTag {
  const empty: ResolvedJobTag = {
    jobId: null,
    jobTitle: null,
    companyName: null,
    label: null,
  };
  const jobs = Array.isArray(linkedJobs) ? linkedJobs : [];
  const meta = note?.metadata || {};
  const body = eventBody(note);
  const differentOppIds = extractDifferentOpportunityJobIds(body, jobs);
  const isTerminal = isTerminalNoteActivity(note);

  let jobId = getEventJobId(note);
  let jobTitle = meta.jobTitle ? String(meta.jobTitle).trim() : null;
  let companyName = meta.companyName ? String(meta.companyName).trim() : null;

  // Explicit metadata must not point at the "different opportunity" job on a
  // free-form Rejected note when that would invert the meaning. Prefer stored
  // jobId always (recruiter deliberately tagged it); only free-form inference
  // is corrected below.
  // Snapshot-only title without id
  if (!jobId && jobTitle) {
    // If title is only the different-opportunity role on a terminal note, drop it
    const titleMatchId = matchJobIdFromText(jobTitle, jobs);
    if (
      isTerminal &&
      titleMatchId &&
      differentOppIds.has(titleMatchId) &&
      !getEventJobId(note)
    ) {
      jobTitle = null;
    } else {
      const match = jobs.find(
        (j) =>
          jobRecordTitle(j).toLowerCase() === jobTitle!.toLowerCase() ||
          jobRecordTitle(j).toLowerCase().includes(jobTitle!.toLowerCase()) ||
          jobTitle!.toLowerCase().includes(jobRecordTitle(j).toLowerCase())
      );
      if (match) {
        jobId = jobRecordId(match) || jobId;
        const en = enrichFromJob(match, jobTitle, companyName);
        jobTitle = en.jobTitle;
        companyName = en.companyName;
      }
    }
  }

  // Infer from body (AI fit for "X", Linked to job: X @ Y, free-form)
  if (!jobId || !jobTitle) {
    // Explicit structured patterns first (subject of the note)
    if (!jobTitle) {
      const linked = body.match(
        /^(?:linked to job|attached to job):\s*(.+?)(?:\s*@\s*(.+))?$/i
      );
      if (linked) {
        jobTitle = linked[1]?.trim() || null;
        companyName = companyName || linked[2]?.trim() || null;
      }
    }
    if (!jobTitle) {
      const ai = body.match(/ai fit for\s*["“]?([^"”\n]+?)["”]?\s*:/i);
      if (ai) jobTitle = ai[1]?.trim() || null;
    }

    // Free-form title match — never use a job that only appears as a
    // "different opportunity" as the note's job tag.
    if (!jobId || !jobTitle) {
      const bodyForMatch = stripDifferentOpportunityClauses(body);
      let inferredId = matchJobIdFromText(bodyForMatch, jobs);

      // Rejected + "different opportunity – Ops" with no other title in body:
      // the subject is the *other* linked job (Finance), not Ops.
      if (!inferredId && isTerminal && differentOppIds.size > 0) {
        const closedCandidates = jobs.filter((j) => {
          const id = jobRecordId(j);
          return Boolean(id) && !differentOppIds.has(id);
        });
        if (closedCandidates.length === 1) {
          inferredId = jobRecordId(closedCandidates[0]);
        } else if (closedCandidates.length > 1) {
          // Prefer a linked job already in a terminal stage
          const terminal = closedCandidates.find((j) =>
            isTerminalJobStage(j?.stage)
          );
          if (terminal) inferredId = jobRecordId(terminal);
        }
      }

      // Last resort free-form match on full body, but never pick a
      // different-opportunity-only job for terminal notes
      if (!inferredId && !isTerminal) {
        inferredId = matchJobIdFromText(body, jobs);
      } else if (!inferredId && isTerminal) {
        const raw = matchJobIdFromText(body, jobs);
        if (raw && !differentOppIds.has(raw)) inferredId = raw;
      }

      if (inferredId) {
        jobId = jobId || inferredId;
        const j = jobs.find((x) => jobRecordId(x) === inferredId);
        const en = enrichFromJob(j, jobTitle, companyName);
        jobTitle = en.jobTitle;
        companyName = en.companyName;
      }
    }
  }

  // If we still tagged a terminal note with the different-opportunity job and
  // have no explicit stored jobId, flip to the closed role.
  if (
    isTerminal &&
    !getEventJobId(note) &&
    jobId &&
    differentOppIds.has(jobId)
  ) {
    const closedCandidates = jobs.filter((j) => {
      const id = jobRecordId(j);
      return Boolean(id) && !differentOppIds.has(id);
    });
    if (closedCandidates.length === 1) {
      jobId = jobRecordId(closedCandidates[0]);
      const en = enrichFromJob(closedCandidates[0], null, null);
      jobTitle = en.jobTitle;
      companyName = en.companyName;
    } else {
      // Ambiguous — do not show the wrong (protected) job as the chip
      jobId = null;
      jobTitle = null;
      companyName = null;
    }
  }

  // Enrich company from linkedJobs by id
  if (jobId && (!companyName || !jobTitle)) {
    const j = jobs.find((x) => jobRecordId(x) === jobId);
    const en = enrichFromJob(j, jobTitle, companyName);
    jobTitle = en.jobTitle;
    companyName = en.companyName;
  }

  if (!jobTitle && !jobId) return empty;

  const label = jobTitle
    ? companyName
      ? `${jobTitle} @ ${companyName}`
      : jobTitle
    : null;

  return { jobId, jobTitle, companyName, label };
}
