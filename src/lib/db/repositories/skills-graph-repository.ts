/**
 * Skills graph repository — snapshot stored on profiles table.
 * id: skills-graph#${tenantId}, type: skills_graph
 *
 * @serverOnly
 */

import { getItem, putItem, tableNames } from "../dynamodb";
import { getAllLeads } from "./lead-repository";
import { getAllJobs } from "./job-repository";
import {
  buildTenantSkillsSnapshot,
  type TenantSkillsGraph,
} from "@/lib/ai/skills-graph";
import { getTenantProductConfig } from "@/lib/tenant-config/repository";
import {
  labelToId,
  mergeTaxonomy,
  recordMatchesQuery,
  splitAndClauses,
} from "@/lib/tags";

export interface SkillsGraphRecord {
  id: string;
  type: "skills_graph";
  tenant_id: string;
  graph: TenantSkillsGraph;
  builtAt: string;
  updated_at: string;
}

export interface TalentCandidateSearchResult {
  id: string;
  name: string;
  title: string;
  location: string;
  email: string;
  tags: string[];
  skills: string[];
  status: string;
  score: number;
}

const STALE_MS = 24 * 60 * 60 * 1000;

function recordId(tenantId: string): string {
  return `skills-graph#${tenantId}`;
}

/**
 * Load stored skills graph snapshot for tenant (or null).
 */
export async function getSkillsGraph(
  tenantId: string
): Promise<TenantSkillsGraph | null> {
  if (!tenantId) return null;
  try {
    const rec = await getItem<SkillsGraphRecord>(tableNames.profiles, {
      id: recordId(tenantId),
    });
    if (!rec?.graph) return null;
    return {
      ...rec.graph,
      builtAt: rec.graph.builtAt || rec.builtAt,
    };
  } catch (err) {
    console.error("[skills-graph] get failed", err);
    return null;
  }
}

/**
 * Persist skills graph snapshot.
 */
export async function saveSkillsGraph(
  tenantId: string,
  graph: TenantSkillsGraph
): Promise<TenantSkillsGraph> {
  const now = new Date().toISOString();
  const builtAt = graph.builtAt || now;
  const payload: SkillsGraphRecord = {
    id: recordId(tenantId),
    type: "skills_graph",
    tenant_id: tenantId,
    graph: { ...graph, builtAt },
    builtAt,
    updated_at: now,
  };
  await putItem(tableNames.profiles, payload as unknown as Record<string, unknown>);
  return payload.graph;
}

/**
 * Rebuild from all leads + jobs and save.
 */
export async function rebuildSkillsGraph(
  tenantId: string
): Promise<TenantSkillsGraph> {
  const [leads, jobs, config] = await Promise.all([
    getAllLeads(tenantId),
    getAllJobs(tenantId),
    getTenantProductConfig(tenantId),
  ]);
  const graph = buildTenantSkillsSnapshot(leads as any[], jobs as any[], {
    tagTaxonomy: config.tagTaxonomy as any,
  });
  return saveSkillsGraph(tenantId, graph);
}

/** Search tenant candidates using legacy skills plus controlled/manual tags. */
export async function searchTalentGraphCandidates(
  tenantId: string,
  input: { query?: string; tags?: string[]; limit?: number }
): Promise<{ candidates: TalentCandidateSearchResult[]; total: number }> {
  const rawQuery = String(input.query || "").trim();
  const andClauses = splitAndClauses(rawQuery);
  const isAndQuery = andClauses.length >= 2;
  const query = isAndQuery ? "" : rawQuery;
  const requestedTags = Array.from(
    new Set((input.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean))
  );
  if (!query && requestedTags.length === 0) {
    return { candidates: [], total: 0 };
  }

  const [leads, config] = await Promise.all([
    getAllLeads(tenantId),
    getTenantProductConfig(tenantId),
  ]);
  const overrides = config.tagTaxonomy as any;
  const taxonomy = mergeTaxonomy(overrides);
  const keyForTag = (value: string) =>
    labelToId(value, taxonomy) || value.trim().toLowerCase();
  const requestedKeys = requestedTags.map(keyForTag);

  const rows: TalentCandidateSearchResult[] = [];
  for (const lead of leads as any[]) {
    const tags = Array.isArray(lead.tags)
      ? lead.tags.map(String).map((tag: string) => tag.trim()).filter(Boolean)
      : [];
    const skills = Array.isArray(lead.skills)
      ? lead.skills.map(String).map((skill: string) => skill.trim()).filter(Boolean)
      : [];
    const candidateTagKeys = new Set(tags.map(keyForTag));
    if (requestedKeys.some((key) => !candidateTagKeys.has(key))) continue;

    const fields = [
      lead.name,
      lead.title,
      lead.location,
      lead.email,
      lead.summary,
      lead.status,
      ...skills,
      ...(lead.experience || []).flatMap((row: any) => [
        row?.title,
        row?.company,
        row?.description,
      ]),
    ];
    if (isAndQuery) {
      const hitsAll = andClauses.every((clause) =>
        recordMatchesQuery({ query: clause, fields, tags, overrides })
      );
      if (!hitsAll) continue;
    } else if (
      query &&
      !recordMatchesQuery({ query, fields, tags, overrides })
    ) {
      continue;
    }

    const q = query.toLowerCase();
    const exactTag = q && tags.some((tag: string) => keyForTag(tag) === keyForTag(q));
    const exactSkill = q && skills.some((skill: string) => skill.toLowerCase() === q);
    const titleHit = q && String(lead.title || "").toLowerCase().includes(q);
    const nameHit = q && String(lead.name || "").toLowerCase().includes(q);
    const score =
      requestedKeys.length * 100 +
      (exactTag ? 40 : 0) +
      (exactSkill ? 30 : 0) +
      (titleHit ? 20 : 0) +
      (nameHit ? 10 : 0);

    rows.push({
      id: String(lead.id || ""),
      name: String(lead.name || "Unknown candidate"),
      title: String(lead.title || ""),
      location: String(lead.location || lead.full_address || ""),
      email: String(lead.email || ""),
      tags,
      skills,
      status: String(lead.status || ""),
      score,
    });
  }

  rows.sort(
    (a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name)
  );
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 50));
  return { candidates: rows.slice(0, limit), total: rows.length };
}

/**
 * Return graph, rebuilding if missing, forced, or older than 24h.
 */
export async function getSkillsGraphFresh(
  tenantId: string,
  opts?: { rebuild?: boolean }
): Promise<{ graph: TenantSkillsGraph; rebuilt: boolean }> {
  if (opts?.rebuild) {
    const graph = await rebuildSkillsGraph(tenantId);
    return { graph, rebuilt: true };
  }

  const existing = await getSkillsGraph(tenantId);
  if (!existing?.builtAt || !Array.isArray(existing.tags)) {
    const graph = await rebuildSkillsGraph(tenantId);
    return { graph, rebuilt: true };
  }

  const age = Date.now() - new Date(existing.builtAt).getTime();
  if (!Number.isFinite(age) || age > STALE_MS) {
    const graph = await rebuildSkillsGraph(tenantId);
    return { graph, rebuilt: true };
  }

  return { graph: existing, rebuilt: false };
}

export function isSkillsGraphStale(graph: TenantSkillsGraph | null): boolean {
  if (!graph?.builtAt) return true;
  const age = Date.now() - new Date(graph.builtAt).getTime();
  return !Number.isFinite(age) || age > STALE_MS;
}
