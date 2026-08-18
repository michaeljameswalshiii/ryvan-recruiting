/**
 * Sequence AI tools for General AI / Bedrock agent.
 * enroll_in_sequence uses confirmGate (preview → confirmed) like CRM writes.
 *
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";
import { confirmGateMessage } from "../crm-write-loop";
import {
  listSequences,
  enrollCandidate,
  getSequence,
} from "../../db/repositories/sequence-repository";
import { getLeadById } from "../../db/repositories/lead-repository";
import { getJobById } from "../../db/repositories/job-repository";
import {
  generateAiFirstDraft,
  buildFirstTouchDraft,
} from "../../sequences/draft";

// ---------------------------------------------------------------------------
// Shared helpers (mirror crm-write confirmGate pattern)
// ---------------------------------------------------------------------------

function needTenant(context: ToolContext): ToolResult | null {
  if (!context.tenantId) {
    return {
      success: false,
      error: "Sign in required. Tenant context missing.",
      metadata: { reason: "no_tenant" },
    };
  }
  return null;
}

function isConfirmed(params: Record<string, unknown>): boolean {
  const c = params.confirmed;
  return c === true || c === "true" || c === 1 || c === "1" || c === "yes";
}

function confirmGate(
  params: Record<string, unknown>,
  action: string,
  preview: Record<string, unknown>
): ToolResult | null {
  if (isConfirmed(params)) return null;
  return {
    success: true,
    data: {
      status: "needs_confirmation",
      action,
      message: confirmGateMessage(action),
      preview,
    },
    metadata: { needs_confirmation: true, action },
  };
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

// ---------------------------------------------------------------------------
// list_sequences
// ---------------------------------------------------------------------------

export const LIST_SEQUENCES_TOOL = "list_sequences";
export const LIST_SEQUENCES_DESCRIPTION =
  "List outreach sequences defined for this tenant (name, steps, active). " +
  "Use before enrolling a candidate so you pick a real sequence id.";

export async function executeListSequences(
  _params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  try {
    const sequences = await listSequences(context.tenantId!);
    return {
      success: true,
      data: {
        count: sequences.length,
        sequences: sequences.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          active: s.active,
          stepCount: s.steps?.length ?? 0,
          steps: (s.steps || []).map((st) => ({
            order: st.order,
            channel: st.channel,
            delayDays: st.delayDays,
            subject: st.subject,
            taskTitle: st.taskTitle,
          })),
        })),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to list sequences",
    };
  }
}

// ---------------------------------------------------------------------------
// enroll_in_sequence
// ---------------------------------------------------------------------------

export const ENROLL_IN_SEQUENCE_TOOL = "enroll_in_sequence";
export const ENROLL_IN_SEQUENCE_DESCRIPTION =
  "Enroll a candidate into an outreach sequence. ALWAYS call once without confirmed " +
  "to preview, show the user, then call again with confirmed:true after they agree. " +
  "Requires sequence_id and candidate_id. Optional job_id for personalization.";

export async function executeEnrollInSequence(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const sequenceId = str(p.sequence_id) || str(p.sequenceId);
  const candidateId = str(p.candidate_id) || str(p.candidateId);
  const jobId = str(p.job_id) || str(p.jobId);

  if (!sequenceId || !candidateId) {
    return {
      success: false,
      error: "sequence_id and candidate_id are required",
    };
  }

  try {
    const sequence = await getSequence(context.tenantId!, sequenceId);
    if (!sequence) {
      return { success: false, error: "Sequence not found" };
    }
    if (!sequence.active) {
      return { success: false, error: "Sequence is not active" };
    }

    const candidate = await getLeadById(context.tenantId!, candidateId);
    if (!candidate) {
      return { success: false, error: "Candidate not found" };
    }

    const job = jobId
      ? await getJobById(context.tenantId!, jobId)
      : null;

    const firstStep = sequence.steps?.[0];
    let draftPreview: { subject?: string; body?: string } = {};
    if (firstStep) {
      try {
        const d = await generateAiFirstDraft({
          candidate: {
            name: candidate.name,
            email: candidate.email,
            title: candidate.title,
            summary: candidate.summary,
            skills: candidate.skills,
            location: candidate.location,
          },
          job: job
            ? {
                title: job.title,
                companyName: job.companyName,
                description: job.description,
              }
            : null,
          sequence,
          step: firstStep,
        });
        draftPreview = { subject: d.subject, body: d.body };
      } catch {
        const d = buildFirstTouchDraft({
          candidate: { name: candidate.name, skills: candidate.skills },
          job: job ? { title: job.title, companyName: job.companyName } : null,
          sequence,
          step: firstStep,
        });
        draftPreview = { subject: d.subject, body: d.body };
      }
    }

    const preview = {
      sequence_id: sequence.id,
      sequence_name: sequence.name,
      candidate_id: candidateId,
      candidate_name: candidate.name,
      candidate_email: candidate.email || "",
      job_id: jobId || "",
      job_title: job?.title || "",
      first_step_draft: draftPreview,
    };

    const gate = confirmGate(p, ENROLL_IN_SEQUENCE_TOOL, preview);
    if (gate) return gate;

    const drafts = firstStep
      ? [
          {
            stepId: firstStep.id,
            subject: draftPreview.subject,
            body: draftPreview.body,
          },
        ]
      : undefined;

    const enrollment = await enrollCandidate(context.tenantId!, {
      sequenceId: sequence.id,
      candidateId,
      candidateName: candidate.name,
      candidateEmail: candidate.email || undefined,
      jobId: jobId || undefined,
      jobTitle: job?.title,
      drafts,
    });

    return {
      success: true,
      data: {
        status: "enrolled",
        enrollment: {
          id: enrollment.id,
          sequenceId: enrollment.sequenceId,
          candidateId: enrollment.candidateId,
          status: enrollment.status,
          currentStepIndex: enrollment.currentStepIndex,
          nextRunAt: enrollment.nextRunAt,
        },
        message: `Enrolled ${candidate.name} in sequence "${sequence.name}".`,
      },
      metadata: { action: ENROLL_IN_SEQUENCE_TOOL },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to enroll in sequence",
    };
  }
}

// ---------------------------------------------------------------------------
// draft_outreach
// ---------------------------------------------------------------------------

export const DRAFT_OUTREACH_TOOL = "draft_outreach";
export const DRAFT_OUTREACH_DESCRIPTION =
  "Generate a personalized outreach email draft (subject + body) for a candidate. " +
  "Does NOT send email and does NOT enroll. Optional sequence_id / job_id for templates.";

export async function executeDraftOutreach(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const candidateId = str(p.candidate_id) || str(p.candidateId);
  const jobId = str(p.job_id) || str(p.jobId);
  const sequenceId = str(p.sequence_id) || str(p.sequenceId);
  const stepIndexRaw = p.step_index ?? p.stepIndex;
  const stepIndex =
    typeof stepIndexRaw === "number"
      ? stepIndexRaw
      : stepIndexRaw != null
        ? parseInt(String(stepIndexRaw), 10)
        : 0;

  if (!candidateId) {
    return { success: false, error: "candidate_id is required" };
  }

  try {
    const candidate = await getLeadById(context.tenantId!, candidateId);
    if (!candidate) {
      return { success: false, error: "Candidate not found" };
    }

    const job = jobId
      ? await getJobById(context.tenantId!, jobId)
      : null;
    const sequence = sequenceId
      ? await getSequence(context.tenantId!, sequenceId)
      : null;
    const step =
      sequence?.steps?.[
        Number.isFinite(stepIndex) && stepIndex >= 0 ? stepIndex : 0
      ] ?? null;

    const draft = await generateAiFirstDraft({
      candidate: {
        name: candidate.name,
        email: candidate.email,
        title: candidate.title,
        summary: candidate.summary,
        skills: candidate.skills,
        location: candidate.location,
      },
      job: job
        ? {
            title: job.title,
            companyName: job.companyName,
            description: job.description,
            location: job.location,
          }
        : null,
      sequence,
      step,
    });

    return {
      success: true,
      data: {
        subject: draft.subject,
        body: draft.body,
        source: draft.source,
        candidate_id: candidateId,
        candidate_name: candidate.name,
        job_id: jobId || null,
        sequence_id: sequence?.id || null,
        note: "Draft only — not sent. Use enroll_in_sequence to enroll.",
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to draft outreach",
    };
  }
}

// ---------------------------------------------------------------------------
// Registry export (do not edit registry.ts — consumers can import SEQUENCE_TOOLS)
// ---------------------------------------------------------------------------

export const SEQUENCE_TOOLS: Array<{
  name: string;
  description: string;
  execute: (params: ToolParams | unknown, context: ToolContext) => Promise<ToolResult>;
  schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}> = [
  {
    name: LIST_SEQUENCES_TOOL,
    description: LIST_SEQUENCES_DESCRIPTION,
    execute: executeListSequences,
    schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: ENROLL_IN_SEQUENCE_TOOL,
    description: ENROLL_IN_SEQUENCE_DESCRIPTION,
    execute: executeEnrollInSequence,
    schema: {
      type: "object",
      properties: {
        sequence_id: { type: "string", description: "Sequence definition id" },
        candidate_id: { type: "string", description: "Candidate/lead id" },
        job_id: { type: "string", description: "Optional job id for personalization" },
        confirmed: {
          type: "boolean",
          description: "false/omit = preview only; true = enroll after user confirms",
        },
      },
      required: ["sequence_id", "candidate_id"],
    },
  },
  {
    name: DRAFT_OUTREACH_TOOL,
    description: DRAFT_OUTREACH_DESCRIPTION,
    execute: executeDraftOutreach,
    schema: {
      type: "object",
      properties: {
        candidate_id: { type: "string", description: "Candidate/lead id" },
        job_id: { type: "string", description: "Optional job id" },
        sequence_id: { type: "string", description: "Optional sequence for templates" },
        step_index: { type: "number", description: "Step index (default 0)" },
      },
      required: ["candidate_id"],
    },
  },
];
