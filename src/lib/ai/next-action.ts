/**
 * Dense "next best action" recommendations for jobs / candidates.
 * Pure rules over stage + fit. Candidate actions never recommend sequences.
 *
 * @serverOnly
 */

import type { FitScoreResult } from "@/lib/ai/fit-score";

export type NextActionKind =
  | "score_review"
  | "enroll_sequence"
  | "send_due_step"
  | "follow_up_task"
  | "mark_reply"
  | "submit"
  | "screen"
  | "advance_stage"
  | "revive_stale"
  | "source_more"
  | "none";

const SEQUENCE_ACTION_KINDS = new Set<NextActionKind>([
  "enroll_sequence",
  "send_due_step",
  "mark_reply",
]);

/** Candidate next actions must not surface sequence enroll / run / reply work. */
export function isSequenceNextAction(
  action: Pick<NextAction, "kind" | "label" | "reason"> | null | undefined
): boolean {
  if (!action) return false;
  if (SEQUENCE_ACTION_KINDS.has(action.kind)) return true;
  return /sequence|enroll/i.test(`${action.label} ${action.reason}`);
}

export interface NextAction {
  kind: NextActionKind;
  priority: number; // higher = more urgent
  label: string;
  reason: string;
  cta?: string;
  href?: string;
  candidateId?: string;
  candidateName?: string;
  jobId?: string;
  meta?: Record<string, unknown>;
}

export interface CandidateActionInput {
  candidateId: string;
  candidateName?: string;
  stage?: string;
  fit?: Pick<FitScoreResult, "score" | "grade"> | null;
  email?: string;
  hasActiveSequence?: boolean;
  sequenceDue?: boolean;
  sequenceEnrollmentId?: string;
  daysInStage?: number;
  lastActivityDays?: number;
}

const STAGE_ORDER = [
  "sourced",
  "applied",
  "left_message",
  "text",
  "email",
  "contacted",
  "interested",
  "pre_screened",
  "submitted",
  "interviewing",
  "offer_out",
  "offer_accepted",
  "placed",
];

function stageIndex(stage?: string): number {
  if (!stage) return 0;
  const s = stage.toLowerCase();
  const i = STAGE_ORDER.indexOf(s);
  if (i >= 0) return i;
  // legacy
  if (/screen/i.test(stage)) return STAGE_ORDER.indexOf("pre_screened");
  if (/interview/i.test(stage)) return STAGE_ORDER.indexOf("interviewing");
  if (/offer/i.test(stage)) return STAGE_ORDER.indexOf("offer_out");
  if (/plac/i.test(stage)) return STAGE_ORDER.indexOf("placed");
  if (/reject|not_interested|withdraw/i.test(stage)) return -1;
  return 0;
}

/**
 * Days since the candidate entered the *current* stage.
 * Prefer stageUpdatedAt — never treat dateApplied alone as "days in stage"
 * (that made Revive stale stick forever after status updates).
 */
export function daysSinceStageUpdate(
  nowMs: number,
  timestamps: {
    stageUpdatedAt?: string | null;
    linkedJobStageUpdatedAt?: string | null;
    leadModifiedAt?: string | null;
    dateApplied?: string | null;
  }
): number {
  const candidates = [
    timestamps.stageUpdatedAt,
    timestamps.linkedJobStageUpdatedAt,
    timestamps.leadModifiedAt,
    // last resort only — application date is not stage entry
    timestamps.dateApplied,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const t = Date.parse(String(raw));
    if (!Number.isNaN(t)) {
      return Math.max(0, Math.floor((nowMs - t) / (24 * 60 * 60 * 1000)));
    }
  }
  return 0;
}

/**
 * Next action for one candidate on a job.
 */
export function nextActionForCandidate(
  c: CandidateActionInput,
  jobId: string
): NextAction {
  const stage = (c.stage || "sourced").toLowerCase();
  const si = stageIndex(stage);

  if (si < 0 || /reject|not_interested|withdraw|declined/i.test(stage)) {
    return {
      kind: "none",
      priority: 0,
      label: "No action",
      reason: "Closed / not pursuing",
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      jobId,
    };
  }

  const score = c.fit?.score;
  if (score != null && score >= 70 && si < STAGE_ORDER.indexOf("submitted")) {
    if (si < STAGE_ORDER.indexOf("contacted") && !c.hasActiveSequence) {
      return {
        kind: "follow_up_task",
        priority: 90,
        label: "Reach out",
        reason: `Strong fit (${score}) but not contacted yet`,
        cta: "Contact",
        candidateId: c.candidateId,
        candidateName: c.candidateName,
        jobId,
        meta: { fitScore: score },
      };
    }
    if (
      si >= STAGE_ORDER.indexOf("interested") &&
      si < STAGE_ORDER.indexOf("submitted")
    ) {
      return {
        kind: "submit",
        priority: 88,
        label: "Submit to client",
        reason: `Fit ${score} + engaged — ready for submission pack`,
        cta: "Submit",
        candidateId: c.candidateId,
        candidateName: c.candidateName,
        jobId,
      };
    }
    if (si < STAGE_ORDER.indexOf("pre_screened") && si >= STAGE_ORDER.indexOf("applied")) {
      return {
        kind: "screen",
        priority: 80,
        label: "Pre-screen",
        reason: "Applicant with solid fit — run screen / questions",
        cta: "Screen",
        candidateId: c.candidateId,
        candidateName: c.candidateName,
        jobId,
      };
    }
  }

  if (score != null && score < 45 && si <= STAGE_ORDER.indexOf("applied")) {
    return {
      kind: "score_review",
      priority: 40,
      label: "Review low fit",
      reason: `Fit ${score} — confirm reject or keep sourcing`,
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      jobId,
    };
  }

  if ((c.daysInStage ?? 0) >= 7 && si >= 0 && si < STAGE_ORDER.indexOf("submitted")) {
    return {
      kind: "revive_stale",
      priority: 75,
      label: "Revive stale",
      reason: `${c.daysInStage}d in ${stage} — nudge or advance`,
      cta: "Follow up",
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      jobId,
    };
  }

  if (!c.hasActiveSequence && si < STAGE_ORDER.indexOf("interested") && c.email) {
    return {
      kind: "follow_up_task",
      priority: 70,
      label: "Make first contact",
      reason: "No outreach logged yet — call, email, or text",
      cta: "Contact",
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      jobId,
    };
  }

  if (si >= STAGE_ORDER.indexOf("contacted") && si < STAGE_ORDER.indexOf("interested")) {
    return {
      kind: "follow_up_task",
      priority: 65,
      label: "Follow up",
      reason: "Contacted — push to interested or not interested",
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      jobId,
    };
  }

  if (si >= STAGE_ORDER.indexOf("submitted") && si < STAGE_ORDER.indexOf("placed")) {
    return {
      kind: "advance_stage",
      priority: 60,
      label: "Advance pipeline",
      reason: `In ${stage} — update after client feedback`,
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      jobId,
    };
  }

  return {
    kind: "none",
    priority: 10,
    label: "Monitor",
    reason: "On track — no urgent action",
    candidateId: c.candidateId,
    candidateName: c.candidateName,
    jobId,
  };
}

/**
 * Aggregate next actions for a job board (sorted by priority).
 */
export function nextActionsForJob(
  jobId: string,
  candidates: CandidateActionInput[],
  opts?: { max?: number }
): {
  actions: NextAction[];
  summary: { urgent: number; enroll: number; due: number; stale: number };
} {
  const actions = candidates
    .map((c) => nextActionForCandidate(c, jobId))
    .filter((a) => !isSequenceNextAction(a))
    .filter((a) => a.kind !== "none" || (a.priority || 0) > 0)
    .sort((a, b) => b.priority - a.priority);

  const max = opts?.max ?? 25;
  const top = actions.slice(0, max);

  return {
    actions: top,
    summary: {
      urgent: top.filter((a) => a.priority >= 85).length,
      enroll: top.filter((a) => a.kind === "enroll_sequence").length,
      due: top.filter((a) => a.kind === "send_due_step").length,
      stale: top.filter((a) => a.kind === "revive_stale").length,
    },
  };
}

/**
 * Job-level suggestion when few/no candidates.
 */
export function jobLevelNextAction(params: {
  jobId: string;
  jobTitle?: string;
  candidateCount: number;
  openStatus?: boolean;
}): NextAction | null {
  if (params.openStatus === false) return null;
  if (params.candidateCount === 0) {
    return {
      kind: "source_more",
      priority: 95,
      label: "Source candidates",
      reason: "No candidates linked — run Fill this req or Apollo search",
      cta: "Fill this req",
      jobId: params.jobId,
      href: `/dashboard/jobs/${params.jobId}`,
    };
  }
  if (params.candidateCount < 5) {
    return {
      kind: "source_more",
      priority: 50,
      label: "Widen pipeline",
      reason: `Only ${params.candidateCount} candidates — source more for coverage`,
      cta: "Fill this req",
      jobId: params.jobId,
    };
  }
  return null;
}
