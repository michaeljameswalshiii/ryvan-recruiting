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

export interface SkillsGraphRecord {
  id: string;
  type: "skills_graph";
  tenant_id: string;
  graph: TenantSkillsGraph;
  builtAt: string;
  updated_at: string;
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
  const [leads, jobs] = await Promise.all([
    getAllLeads(tenantId),
    getAllJobs(tenantId),
  ]);
  const graph = buildTenantSkillsSnapshot(leads as any[], jobs as any[]);
  return saveSkillsGraph(tenantId, graph);
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
  if (!existing?.builtAt) {
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
