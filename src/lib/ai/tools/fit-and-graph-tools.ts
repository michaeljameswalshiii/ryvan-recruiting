/**
 * AI tool definitions for fit scoring + talent skills graph.
 * DO NOT register here — parent wires into registry.
 *
 * @serverOnly
 */

import type { ToolDefinition, ToolParams, ToolContext, ToolResult } from "./types";
import { getJobById } from "@/lib/db/repositories/job-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import {
  scoreCandidateJobFit,
  formatFitSummary,
  type FitCandidateInput,
} from "@/lib/ai/fit-score";
import { getSkillsGraphFresh } from "@/lib/db/repositories/skills-graph-repository";

function leadToCandidateInput(lead: {
  skills?: string[];
  title?: string;
  summary?: string;
  experience?: FitCandidateInput["experience"];
  location?: string;
  notes?: string;
}): FitCandidateInput {
  return {
    skills: lead.skills,
    title: lead.title,
    summary: [lead.summary, lead.notes].filter(Boolean).join("\n"),
    experience: lead.experience,
    location: lead.location,
  };
}

/**
 * score_candidate_fit — job_id + candidate_id
 */
export async function executeScoreCandidateFit(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  if (!context.tenantId) {
    return {
      success: false,
      error: "Tenant context required",
      metadata: { reason: "no_tenant" },
    };
  }

  const jobId = String(
    (params as any).job_id || (params as any).jobId || ""
  ).trim();
  const candidateId = String(
    (params as any).candidate_id || (params as any).candidateId || ""
  ).trim();

  if (!jobId || !candidateId) {
    return {
      success: false,
      error: "job_id and candidate_id are required",
    };
  }

  try {
    const [job, lead] = await Promise.all([
      getJobById(context.tenantId, jobId),
      getLeadById(context.tenantId, candidateId),
    ]);

    if (!job) {
      return { success: false, error: "Job not found" };
    }
    if (!lead) {
      return { success: false, error: "Candidate not found" };
    }

    const fit = scoreCandidateJobFit(leadToCandidateInput(lead as any), {
      title: job.title,
      description: job.description,
      location: job.location,
      salaryRange: (job as any).salaryRange,
    });

    return {
      success: true,
      data: {
        jobId,
        jobTitle: job.title,
        candidateId,
        candidateName: lead.name,
        fit,
        summary: formatFitSummary(fit),
      },
      metadata: { tool: "score_candidate_fit" },
    };
  } catch (err) {
    console.error("[score_candidate_fit]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to score fit",
    };
  }
}

/**
 * get_talent_graph — top skills summary for tenant
 */
export async function executeGetTalentGraph(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  if (!context.tenantId) {
    return {
      success: false,
      error: "Tenant context required",
      metadata: { reason: "no_tenant" },
    };
  }

  const rebuild =
    String((params as any).rebuild || "").toLowerCase() === "true" ||
    (params as any).rebuild === 1 ||
    (params as any).rebuild === true;

  try {
    const { graph, rebuilt } = await getSkillsGraphFresh(context.tenantId, {
      rebuild,
    });

    const topSkills = (graph.skills || []).slice(0, 15).map((s) => ({
      skill: s.skill,
      count: s.count,
      placedCount: s.placedCount,
    }));
    const topPlaced = (graph.topPlacedSkills || []).slice(0, 10).map((s) => ({
      skill: s.skill,
      count: s.count,
      placedCount: s.placedCount,
    }));

    const titleKeys = Object.keys(graph.byJobTitle || {}).slice(0, 8);
    const byJobTitleSample: Record<string, Array<{ skill: string; placedCount: number }>> =
      {};
    for (const t of titleKeys) {
      byJobTitleSample[t] = (graph.byJobTitle[t] || [])
        .slice(0, 5)
        .map((n) => ({ skill: n.skill, placedCount: n.placedCount }));
    }

    return {
      success: true,
      data: {
        summary: {
          topSkills,
          topPlacedSkills: topPlaced,
          byJobTitleSample,
          meta: graph.meta,
          builtAt: graph.builtAt,
          rebuilt,
        },
      },
      metadata: { tool: "get_talent_graph" },
    };
  } catch (err) {
    console.error("[get_talent_graph]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load talent graph",
    };
  }
}

/** Exported tool definitions for registry wiring */
export const FIT_GRAPH_TOOLS: ToolDefinition[] = [
  {
    name: "score_candidate_fit",
    description:
      "Score how well a candidate fits a job (0-100 + grade + reasons). " +
      "Uses skills overlap, title/role keywords, location, and seniority heuristics. " +
      "Params: job_id, candidate_id.",
    execute: executeScoreCandidateFit,
  },
  {
    name: "get_talent_graph",
    description:
      "Get a summary of the tenant talent skills graph: top skills across candidates, " +
      "skills associated with placements/offers, and sample skills by job title. " +
      "Optional param: rebuild (boolean) to force rebuild.",
    execute: executeGetTalentGraph,
  },
];
