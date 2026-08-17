/**
 * Bounded LLM judgment for Fit Score v3.
 * Cannot override hard gates. Unknowns stay questions.
 * @serverOnly
 */

import { completeJson, fillJobRerankModelChain } from "@/lib/list-builder/llm-json";
import type { FitCandidateInput, FitJobInput } from "@/lib/ai/fit-score";
import {
  bandFromScore,
  gradeFromBand,
  type FitScoreV3,
  type HmReachOut,
} from "@/lib/ai/fit-score-v3";

type LlmJudgment = {
  experiencePts?: number;
  industryPts?: number;
  skillsPts?: number;
  locationPts?: number;
  hmReachOut?: HmReachOut;
  hmReason?: string;
  verify?: string[];
  strengths?: string[];
  concerns?: string[];
};

function clip(text: string, n: number) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function candidatePacket(c: FitCandidateInput): string {
  const exp = (c.experience || [])
    .slice(0, 8)
    .map((e) => `- ${e.title || ""} @ ${e.company || ""} (${e.dates || ""}): ${clip(String(e.description || ""), 280)}`)
    .join("\n");
  return `TITLE: ${c.title || ""}
LOCATION: ${c.location || ""}
SKILLS: ${(c.skills || []).slice(0, 30).join(", ")}
SUMMARY: ${clip(c.summary || "", 1800)}
EXPERIENCE:
${exp || "(see summary)"}`;
}

export async function augmentFitScoreV3WithLlm(
  base: FitScoreV3,
  candidate: FitCandidateInput,
  job: FitJobInput,
  ctx?: { tenantId?: string; userId?: string }
): Promise<FitScoreV3> {
  const system = `You are a recruiting reviewer using Trio Fit Score v3.
This is triage to SURFACE good people, not reject them.

Rules:
- Score demonstrated capability, not box-checking.
- Unknowns are questions, never deductions.
- Degrees and exact titles are not disqualifying.
- Do not invent qualifications.
- Missing a nice-to-have barely moves the score.
- If a hiring manager would reach out after reading this resume, say Yes.

Return ONLY JSON:
{
  "experiencePts": 0-35,
  "industryPts": 0-25,
  "skillsPts": 0-25,
  "locationPts": 0-15,
  "hmReachOut": "Yes" | "Maybe" | "No",
  "hmReason": "one sentence",
  "verify": ["question"],
  "strengths": ["short"],
  "concerns": ["only real concerns, not unknowns"]
}`;

  const user = `JOB: ${job.title || ""}
JOB LOCATION: ${job.location || ""}
COMPANY: ${job.companyName || ""}
JD:
${clip(String(job.description || ""), 2800)}

CANDIDATE:
${candidatePacket(candidate)}

DETERMINISTIC DRAFT:
Experience ${base.rubric?.[0]?.points ?? "?"}/35
Industry ${base.rubric?.[1]?.points ?? "?"}/25
Skills ${base.rubric?.[2]?.points ?? "?"}/25
Location ${base.rubric?.[3]?.points ?? "?"}/15
Composite ${base.score}/100`;

  try {
    const { data, modelId } = await completeJson<LlmJudgment>(
      system,
      user,
      {
        tenantId: ctx?.tenantId,
        userId: ctx?.userId,
        purpose: "fit-score-v3",
        queryPreview: `${job.title || "job"} / ${candidate.title || "candidate"}`,
      },
      {
        timeoutMs: 10_000,
        modelIds: fillJobRerankModelChain(),
        temperature: 0.1,
        maxTokens: 900,
      }
    );
    if (!data) return { ...base, llmUsed: false };

    const blend = (det: number, llm: number | undefined, max: number) => {
      if (typeof llm !== "number" || Number.isNaN(llm)) return det;
      const l = Math.max(0, Math.min(max, Math.round(llm)));
      return Math.round(0.55 * det + 0.45 * l);
    };

    const exp = blend(base.rubric?.[0]?.points || 0, data.experiencePts, 35);
    const industry = blend(base.rubric?.[1]?.points || 0, data.industryPts, 25);
    const skills = blend(base.rubric?.[2]?.points || 0, data.skillsPts, 25);
    const location = blend(base.rubric?.[3]?.points || 0, data.locationPts, 15);
    let score = exp + industry + skills + location;

    const hm = (data.hmReachOut === "Yes" || data.hmReachOut === "Maybe" || data.hmReachOut === "No")
      ? data.hmReachOut
      : base.hmReachOut;
    const hmReason = (data.hmReason || base.hmReason).slice(0, 280);

    if (hm === "Yes" && exp >= 28 && industry >= 18 && score < 85) {
      score = 85;
    }
    if (hm === "Yes" && score >= 80 && score < 88) {
      score = Math.min(88, score + 2);
    }

    for (const g of base.gates || []) {
      if (!g.passed && typeof g.cap === "number") score = Math.min(score, g.cap);
    }
    score = Math.max(1, Math.min(100, score));

    const rubric = (base.rubric || []).map((f) => {
      const points =
        f.id === "experience" ? exp :
        f.id === "industry" ? industry :
        f.id === "skills" ? skills :
        location;
      return { ...f, points };
    });

    const verify = Array.from(
      new Set([...(data.verify || []), ...(base.verifyBeforeAdvancing || [])])
    ).slice(0, 6);

    const strengths = Array.from(
      new Set([...(data.strengths || []), ...base.strengths])
    ).slice(0, 8);
    const gaps = Array.from(
      new Set([...(data.concerns || []), ...base.gaps])
    ).slice(0, 6);

    const band = bandFromScore(score);
    return {
      ...base,
      score,
      grade: gradeFromBand(score),
      band,
      hmReachOut: hm,
      hmReason,
      rubric,
      strengths,
      gaps,
      verifyBeforeAdvancing: verify,
      llmUsed: true,
      llmModel: modelId,
      reasons: [
        `COMPOSITE ${score}/100 — ${band}`,
        `Relevant Experience / Can-Do: ${exp}/35 — ${rubric[0]?.detail || ""}`,
        `Industry Alignment: ${industry}/25 — ${rubric[1]?.detail || ""}`,
        `Software/Skills/Certs: ${skills}/25 — ${rubric[2]?.detail || ""}`,
        `Location & Logistics: ${location}/15 — ${rubric[3]?.detail || ""}`,
        `WOULD A HIRING MANAGER REACH OUT? ${hm} — ${hmReason}`,
      ],
    };
  } catch {
    return { ...base, llmUsed: false };
  }
}
