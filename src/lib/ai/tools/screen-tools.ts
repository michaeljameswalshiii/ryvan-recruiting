/**
 * AI tools for careers pre-screen questions on jobs.
 * Not auto-wired into registry (caller / future wiring).
 *
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";
import { getJobById, updateJob } from "../../db/repositories/job-repository";

function needTenant(context: ToolContext): ToolResult | null {
  if (!context.tenantId) {
    return {
      success: false,
      error: "Sign in required. Tenant context missing — cannot modify jobs.",
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
      message:
        "Do NOT invent that this was saved. Show the user this preview and ask them to confirm. " +
        "When they say yes, call this tool again with the same fields and confirmed: true.",
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

function makeId(): string {
  return `psq_${Math.random().toString(36).slice(2, 10)}`;
}

export const SET_JOB_PRESCREEN_QUESTIONS_TOOL = "set_job_prescreen_questions";
export const SET_JOB_PRESCREEN_QUESTIONS_DESCRIPTION =
  "Set pre-screen questions on a job for the public careers apply form. " +
  "Requires job_id and questions (array of prompts or {prompt, type?, options?}). " +
  "Preview first, then confirmed:true. Pass empty questions array to clear.";

export async function executeSetJobPrescreenQuestions(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const jobId = str(p.job_id) || str(p.id) || str(p.jobId);
  if (!jobId) return { success: false, error: "job_id is required" };

  const existing = await getJobById(context.tenantId!, jobId);
  if (!existing) return { success: false, error: `Job not found: ${jobId}` };

  let rawQuestions = p.questions ?? p.preScreenQuestions ?? p.pre_screen_questions;
  if (typeof rawQuestions === "string") {
    try {
      rawQuestions = JSON.parse(rawQuestions);
    } catch {
      // treat as single prompt
      rawQuestions = [rawQuestions];
    }
  }

  if (!Array.isArray(rawQuestions)) {
    return {
      success: false,
      error:
        "questions must be an array of strings or {prompt, type?, options?, required?} objects",
    };
  }

  const normalized = rawQuestions
    .map((q: unknown) => {
      if (typeof q === "string") {
        const prompt = q.trim().slice(0, 500);
        if (!prompt) return null;
        return {
          id: makeId(),
          prompt,
          type: "text" as const,
          required: true,
        };
      }
      if (q && typeof q === "object") {
        const o = q as Record<string, unknown>;
        const prompt = str(o.prompt) || str(o.question) || str(o.text);
        if (!prompt) return null;
        const typeRaw = (str(o.type) || "text").toLowerCase();
        const type = (
          ["text", "yes_no", "number", "choice"].includes(typeRaw)
            ? typeRaw
            : "text"
        ) as "text" | "yes_no" | "number" | "choice";
        const options = Array.isArray(o.options)
          ? o.options.map((x) => String(x).slice(0, 200)).filter(Boolean)
          : undefined;
        return {
          id: str(o.id) || makeId(),
          prompt: prompt.slice(0, 500),
          type,
          options,
          required: o.required === false ? false : true,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<{
    id: string;
    prompt: string;
    type: "text" | "yes_no" | "number" | "choice";
    options?: string[];
    required: boolean;
  }>;

  const preview = {
    job_id: jobId,
    job_title: existing.title,
    question_count: normalized.length,
    questions: normalized.map((q) => ({
      prompt: q.prompt,
      type: q.type,
      required: q.required,
    })),
  };

  const gate = confirmGate(p, SET_JOB_PRESCREEN_QUESTIONS_TOOL, preview);
  if (gate) return gate;

  try {
    await updateJob(context.tenantId!, jobId, {
      preScreenQuestions: normalized,
    } as any);

    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/dashboard/jobs");
      revalidatePath(`/dashboard/jobs/${jobId}`);
    } catch {
      /* non-Next */
    }

    return {
      success: true,
      data: {
        status: "updated",
        job_id: jobId,
        question_count: normalized.length,
        message: `Set ${normalized.length} pre-screen question(s) on "${existing.title}".`,
      },
      metadata: { action: SET_JOB_PRESCREEN_QUESTIONS_TOOL, id: jobId },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to set pre-screen questions",
    };
  }
}

export const SCREEN_TOOLS: Array<{
  name: string;
  description: string;
  execute: (
    params: ToolParams | unknown,
    context: ToolContext
  ) => Promise<ToolResult>;
  schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}> = [
  {
    name: SET_JOB_PRESCREEN_QUESTIONS_TOOL,
    description: SET_JOB_PRESCREEN_QUESTIONS_DESCRIPTION,
    execute: executeSetJobPrescreenQuestions,
    schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job id to update" },
        questions: {
          type: "string",
          description:
            "Array of question prompts (strings) or objects {prompt, type, options, required}. Pass [] to clear.",
        },
        confirmed: {
          type: "boolean",
          description:
            "false/omit = preview only; true = save after user confirms",
        },
      },
      required: ["job_id", "questions"],
    },
  },
];
