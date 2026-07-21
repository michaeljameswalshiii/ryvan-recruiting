/**
 * Tenant skills / outcome graph builders.
 * Pure aggregation — no DynamoDB.
 */

import { normalizeSkill as fitNormalizeSkill, extractSkillsFromText } from "./fit-score";

export { normalizeSkill } from "./fit-score";

export interface SkillNode {
  skill: string;
  count: number;
  placedCount: number;
}

export interface TenantSkillsGraph {
  skills: SkillNode[];
  topPlacedSkills: SkillNode[];
  byJobTitle: Record<string, SkillNode[]>;
  /** ISO timestamp when snapshot was built */
  builtAt?: string;
  /** Total candidates / jobs scanned */
  meta?: {
    leadCount: number;
    jobCount: number;
    placedOutcomes: number;
  };
}

function isPlacedStage(stage?: string): boolean {
  if (!stage) return false;
  const s = stage.toLowerCase().trim();
  return (
    s === "placed" ||
    s === "offer_accepted" ||
    s === "accept" ||
    s === "converted" ||
    s === "offered" // soft: sometimes used as terminal win
  );
}

function skillListFromLead(lead: {
  skills?: string[];
  title?: string;
  summary?: string;
  experience?: Array<{ title?: string; description?: string; [k: string]: unknown }>;
  notes?: string;
}): string[] {
  const explicit = (lead.skills || []).map(fitNormalizeSkill).filter(Boolean);
  const blob = [
    lead.title,
    lead.summary,
    lead.notes,
    ...(lead.experience || []).flatMap((e) => [e.title, e.description]),
  ]
    .filter(Boolean)
    .join("\n");
  const extracted = extractSkillsFromText(blob);
  return Array.from(new Set([...explicit, ...extracted]));
}

function skillListFromJob(job: {
  title?: string;
  description?: string;
}): string[] {
  return extractSkillsFromText([job.title, job.description].filter(Boolean).join("\n"));
}

type MutableNode = { skill: string; count: number; placedCount: number };

function bump(
  map: Map<string, MutableNode>,
  skill: string,
  opts: { count?: number; placed?: number } = {}
) {
  const key = fitNormalizeSkill(skill);
  if (!key) return;
  let node = map.get(key);
  if (!node) {
    node = { skill: key, count: 0, placedCount: 0 };
    map.set(key, node);
  }
  if (opts.count) node.count += opts.count;
  if (opts.placed) node.placedCount += opts.placed;
}

/**
 * Build a tenant skills snapshot from leads + jobs.
 * Outcome edges: when linkedJobs stage is placed / offer_accepted,
 * attribute candidate skills as "winning" skills for that job title / company.
 */
export function buildTenantSkillsSnapshot(
  leads: Array<{
    skills?: string[];
    title?: string;
    summary?: string;
    experience?: Array<{ title?: string; description?: string; [k: string]: unknown }>;
    notes?: string;
    linkedJobs?: Array<{
      jobId?: string;
      jobTitle?: string;
      companyName?: string;
      stage?: string;
    }>;
  }>,
  jobs: Array<{
    id?: string;
    title?: string;
    description?: string;
    companyName?: string;
    candidates?: Array<{
      candidateId?: string;
      stage?: string;
    }>;
  }>
): TenantSkillsGraph {
  const global = new Map<string, MutableNode>();
  const byTitle = new Map<string, Map<string, MutableNode>>();
  let placedOutcomes = 0;

  const ensureTitleMap = (title: string) => {
    const t = (title || "Unknown role").trim() || "Unknown role";
    if (!byTitle.has(t)) byTitle.set(t, new Map());
    return { title: t, map: byTitle.get(t)! };
  };

  // Index jobs for title lookup
  const jobById = new Map<string, (typeof jobs)[0]>();
  for (const j of jobs) {
    if (j.id) jobById.set(j.id, j);
    // Job description skills contribute to demand signal (count only)
    for (const s of skillListFromJob(j)) {
      bump(global, s, { count: 0 }); // presence in jobs doesn't inflate candidate counts
    }
  }

  for (const lead of leads) {
    const skills = skillListFromLead(lead);
    for (const s of skills) {
      bump(global, s, { count: 1 });
    }

    // From candidate-centric linkedJobs
    const linked = Array.isArray(lead.linkedJobs) ? lead.linkedJobs : [];
    for (const lj of linked) {
      if (!isPlacedStage(lj.stage)) continue;
      placedOutcomes += 1;
      const job = lj.jobId ? jobById.get(lj.jobId) : undefined;
      const title =
        lj.jobTitle || job?.title || "Unknown role";
      const { map } = ensureTitleMap(title);
      for (const s of skills) {
        bump(global, s, { placed: 1 });
        bump(map, s, { count: 1, placed: 1 });
      }
    }
  }

  // Also walk job.candidates for stages when dual-write may only live on job side
  for (const job of jobs) {
    const cands = Array.isArray(job.candidates) ? job.candidates : [];
    for (const c of cands) {
      if (!isPlacedStage(c.stage)) continue;
      // Find lead skills if we can match by walking leads again is expensive —
      // already counted via linkedJobs when present. If only on job side,
      // we still want the outcome for title graph using job required skills as proxy.
      const title = job.title || "Unknown role";
      const { map } = ensureTitleMap(title);
      const jobSkills = skillListFromJob(job);
      // Soft: attribute job skills as "winning" demand when someone was placed
      // (candidate skills already counted when linkedJobs present)
      for (const s of jobSkills) {
        bump(map, s, { count: 1, placed: 1 });
      }
    }
  }

  const toSorted = (map: Map<string, MutableNode>): SkillNode[] =>
    Array.from(map.values())
      .filter((n) => n.count > 0 || n.placedCount > 0)
      .sort((a, b) => b.count - a.count || b.placedCount - a.placedCount || a.skill.localeCompare(b.skill));

  const skills = toSorted(global);
  const topPlacedSkills = [...skills]
    .filter((n) => n.placedCount > 0)
    .sort((a, b) => b.placedCount - a.placedCount || b.count - a.count)
    .slice(0, 50);

  const byJobTitle: Record<string, SkillNode[]> = {};
  for (const [title, map] of byTitle.entries()) {
    byJobTitle[title] = toSorted(map).slice(0, 30);
  }

  return {
    skills: skills.slice(0, 200),
    topPlacedSkills,
    byJobTitle,
    builtAt: new Date().toISOString(),
    meta: {
      leadCount: leads.length,
      jobCount: jobs.length,
      placedOutcomes,
    },
  };
}
