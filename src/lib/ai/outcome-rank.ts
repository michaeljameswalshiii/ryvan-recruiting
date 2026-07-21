/**
 * Outcome-aware ranking: boost fit scores using tenant placement skills.
 *
 * @serverOnly
 */

import {
  scoreCandidateJobFit,
  normalizeSkill,
  extractSkillsFromText,
  type FitCandidateInput,
  type FitJobInput,
  type FitScoreResult,
  type FitGrade,
} from "@/lib/ai/fit-score";
import type { TenantSkillsGraph, SkillNode } from "@/lib/ai/skills-graph";

export interface OutcomeRankResult extends FitScoreResult {
  baseScore: number;
  outcomeBoost: number;
  outcomeReasons: string[];
  rankedWithOutcomes: true;
}

function gradeFromScore(score: number): FitGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function titleKey(title?: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a weight map of skills that correlate with placements for similar titles.
 */
export function placementSkillWeights(
  graph: TenantSkillsGraph | null | undefined,
  jobTitle?: string
): Map<string, number> {
  const weights = new Map<string, number>();
  if (!graph) return weights;

  // Global placed skills
  for (const n of graph.topPlacedSkills || graph.skills || []) {
    if ((n.placedCount || 0) <= 0) continue;
    const k = normalizeSkill(n.skill);
    if (!k) continue;
    const w = Math.min(3, 0.5 + Math.log2(1 + n.placedCount));
    weights.set(k, Math.max(weights.get(k) || 0, w));
  }

  // Title-specific boost
  const tk = titleKey(jobTitle);
  if (tk && graph.byJobTitle) {
    for (const [title, nodes] of Object.entries(graph.byJobTitle)) {
      const sim =
        titleKey(title) === tk ||
        titleKey(title).includes(tk) ||
        tk.includes(titleKey(title));
      if (!sim) continue;
      for (const n of nodes as SkillNode[]) {
        if ((n.placedCount || 0) <= 0 && (n.count || 0) <= 0) continue;
        const k = normalizeSkill(n.skill);
        if (!k) continue;
        const w = Math.min(4, 1 + Math.log2(1 + (n.placedCount || n.count || 1)));
        weights.set(k, Math.max(weights.get(k) || 0, w));
      }
    }
  }

  return weights;
}

/**
 * Score with base fit + outcome boost (max +15 points).
 */
export function scoreCandidateJobFitWithOutcomes(
  candidate: FitCandidateInput,
  job: FitJobInput,
  graph?: TenantSkillsGraph | null
): OutcomeRankResult {
  const base = scoreCandidateJobFit(candidate, job);
  const outcomeReasons: string[] = [];
  let outcomeBoost = 0;

  if (graph) {
    const weights = placementSkillWeights(graph, job.title);
    if (weights.size > 0) {
      const candSkills = new Set(
        [
          ...(candidate.skills || []).map(normalizeSkill),
          ...extractSkillsFromText(
            [candidate.title, candidate.summary, ...(candidate.skills || [])]
              .filter(Boolean)
              .join(" ")
          ),
        ].filter(Boolean)
      );

      let matchedWeight = 0;
      let matched = 0;
      const examples: string[] = [];
      for (const skill of candSkills) {
        const w = weights.get(skill);
        if (w && w > 0) {
          matchedWeight += w;
          matched += 1;
          if (examples.length < 4) examples.push(skill);
        }
      }

      if (matched > 0) {
        // Normalize: ~3 strong placement skills → full +15
        outcomeBoost = Math.min(15, Math.round((matchedWeight / 4) * 8));
        outcomeReasons.push(
          `Placement-skill boost +${outcomeBoost}: ${examples.join(", ")}`
        );
      } else if ((graph.topPlacedSkills || []).some((s) => (s.placedCount || 0) > 0)) {
        outcomeReasons.push(
          "No overlap with skills from past placements (no outcome boost)"
        );
      }
    }
  }

  const score = Math.max(0, Math.min(100, base.score + outcomeBoost));
  const reasons = [...base.reasons, ...outcomeReasons];

  return {
    ...base,
    score,
    grade: gradeFromScore(score),
    reasons,
    baseScore: base.score,
    outcomeBoost,
    outcomeReasons,
    rankedWithOutcomes: true,
  };
}

/**
 * Rank candidates for a job using outcome-aware scores.
 */
export function rankCandidatesForJob<T extends { id: string }>(
  candidates: Array<T & FitCandidateInput & { id: string; name?: string }>,
  job: FitJobInput,
  graph?: TenantSkillsGraph | null
): Array<{
  candidateId: string;
  name?: string;
  fit: OutcomeRankResult;
}> {
  return candidates
    .map((c) => ({
      candidateId: c.id,
      name: c.name,
      fit: scoreCandidateJobFitWithOutcomes(c, job, graph),
    }))
    .sort((a, b) => b.fit.score - a.fit.score);
}
