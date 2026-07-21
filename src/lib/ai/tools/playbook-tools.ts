/**
 * Playbook AI tools (Fill this req, etc.)
 * DO NOT edit registry.ts — export PLAYBOOK_TOOLS for consumers to import.
 *
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";
import { runFillReqPlaybook } from "../playbooks/fill-req";

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

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

// ---------------------------------------------------------------------------
// fill_req_playbook
// ---------------------------------------------------------------------------

export const FILL_REQ_PLAYBOOK_TOOL = "fill_req_playbook";
export const FILL_REQ_PLAYBOOK_DESCRIPTION =
  "Run the Fill this req playbook for a job: rank internal candidates by fit, " +
  "produce outreach drafts and a next-action plan. Does NOT auto-mutate CRM. " +
  "Params: job_id (required), max_candidates (optional, default 10).";

export async function executeFillReqPlaybookTool(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const jobId = str(p.job_id) || str(p.jobId);
  if (!jobId) {
    return { success: false, error: "job_id is required" };
  }

  const maxRaw = p.max_candidates ?? p.maxCandidates;
  let maxCandidates = 10;
  if (typeof maxRaw === "number" && Number.isFinite(maxRaw)) {
    maxCandidates = maxRaw;
  } else if (maxRaw != null) {
    const n = parseInt(String(maxRaw), 10);
    if (Number.isFinite(n)) maxCandidates = n;
  }

  try {
    const result = await runFillReqPlaybook({
      tenantId: context.tenantId!,
      userId: context.userId || undefined,
      jobId,
      options: {
        maxCandidates,
        enrollSequenceId: str(p.sequence_id) || str(p.sequenceId),
      },
    });

    // Compact payload for the model
    return {
      success: true,
      data: {
        summary: result.summary,
        job: result.job,
        ranked: result.ranked.slice(0, maxCandidates).map((r) => ({
          candidate_id: r.candidateId,
          name: r.name,
          email: r.email,
          title: r.title,
          score: r.score,
          already_linked: r.alreadyLinked,
          reasons: r.reasons.slice(0, 3),
        })),
        drafts: result.drafts.map((d) => ({
          candidate_id: d.candidateId,
          candidate_name: d.candidateName,
          subject: d.subject,
          body: d.body.slice(0, 1200),
        })),
        next_actions: result.nextActions,
        suggested_sequence_id: result.suggestedSequenceId,
        notes: result.notes,
      },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "fill_req_playbook failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Registry export
// ---------------------------------------------------------------------------

export const PLAYBOOK_TOOLS: Array<{
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
    name: FILL_REQ_PLAYBOOK_TOOL,
    description: FILL_REQ_PLAYBOOK_DESCRIPTION,
    execute: executeFillReqPlaybookTool,
    schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job id to fill" },
        max_candidates: {
          type: "number",
          description: "Max ranked candidates (default 10, max 50)",
        },
        sequence_id: {
          type: "string",
          description: "Optional sequence for draft templates / enroll suggestion",
        },
      },
      required: ["job_id"],
    },
  },
];
