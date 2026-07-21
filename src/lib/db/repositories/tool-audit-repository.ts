/**
 * Tool execution audit log + aggregate stats (profiles table).
 * Stores individual audits and a per-tenant stats counter.
 *
 * @serverOnly
 */

import { getItem, putItem, scanItems, tableNames } from "../dynamodb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolAuditRecord {
  id: string;
  tenant_id: string;
  userId?: string;
  type: "tool_audit";
  toolName: string;
  success: boolean;
  error?: string;
  durationMs: number;
  paramsSummary?: string;
  resultStatus?: string;
  createdAt: string;
}

export interface ToolStatBucket {
  calls: number;
  successes: number;
  failures: number;
  totalMs: number;
}

export interface ToolAuditStatsRecord {
  id: string;
  tenant_id: string;
  type: "tool_audit_stats";
  tools: Record<string, ToolStatBucket>;
  updatedAt: string;
}

export interface RecordToolAuditInput {
  tenantId: string;
  userId?: string | null;
  toolName: string;
  success: boolean;
  error?: string;
  durationMs: number;
  params?: unknown;
  resultStatus?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SENSITIVE_KEY =
  /^(api[_-]?key|apikey|password|passwd|secret|token|authorization|auth|bearer|access[_-]?key|secret[_-]?key|credential|private[_-]?key)$/i;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function statsId(tenantId: string): string {
  return `tool-audit-stats#${tenantId}`;
}

/**
 * Safe params summary: keys only (or truncated JSON of non-sensitive scalars).
 * NEVER store raw API keys / secrets.
 */
export function buildParamsSummary(params: unknown): string | undefined {
  if (params === undefined || params === null) return undefined;

  try {
    if (typeof params !== "object" || Array.isArray(params)) {
      const s = JSON.stringify(params);
      return s.length > 500 ? s.slice(0, 500) + "…" : s;
    }

    const obj = params as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => !SENSITIVE_KEY.test(k));
    const summary: Record<string, string> = {};
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined || v === null) {
        summary[k] = String(v);
      } else if (typeof v === "object") {
        summary[k] = Array.isArray(v) ? `[array:${v.length}]` : "[object]";
      } else if (typeof v === "string" && SENSITIVE_KEY.test(k)) {
        summary[k] = "[redacted]";
      } else if (typeof v === "string" && v.length > 80) {
        summary[k] = `${v.slice(0, 80)}…`;
      } else {
        summary[k] = String(v);
      }
    }
    // Prefer keys-only compact form; include brief values when short
    const json = JSON.stringify(summary);
    return json.length > 500 ? json.slice(0, 500) + "…" : json;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function recordToolAudit(
  input: RecordToolAuditInput
): Promise<ToolAuditRecord | null> {
  const tenantId = (input.tenantId || "").trim();
  if (!tenantId) return null;

  const now = new Date().toISOString();
  const id = `tool-audit#${tenantId}#${now}#${randomSuffix()}`;

  const record: ToolAuditRecord = {
    id,
    tenant_id: tenantId,
    type: "tool_audit",
    toolName: String(input.toolName || "unknown").slice(0, 120),
    success: !!input.success,
    durationMs: Math.max(0, Math.round(input.durationMs || 0)),
    createdAt: now,
  };

  if (input.userId) record.userId = String(input.userId);
  if (input.error) record.error = String(input.error).slice(0, 500);
  if (input.resultStatus) {
    record.resultStatus = String(input.resultStatus).slice(0, 120);
  }
  const paramsSummary = buildParamsSummary(input.params);
  if (paramsSummary) record.paramsSummary = paramsSummary;

  try {
    await putItem(tableNames.profiles, record);
  } catch (err) {
    console.warn("[tool-audit] put audit failed:", err);
    // Still try to update stats below
  }

  try {
    await bumpToolStats(tenantId, record.toolName, record.success, record.durationMs);
  } catch (err) {
    console.warn("[tool-audit] stats bump failed:", err);
  }

  return record;
}

async function bumpToolStats(
  tenantId: string,
  toolName: string,
  success: boolean,
  durationMs: number
): Promise<void> {
  const id = statsId(tenantId);
  const existing = await getItem<ToolAuditStatsRecord>(tableNames.profiles, {
    id,
  });

  const tools: Record<string, ToolStatBucket> = {
    ...(existing?.tools || {}),
  };
  const bucket: ToolStatBucket = tools[toolName] || {
    calls: 0,
    successes: 0,
    failures: 0,
    totalMs: 0,
  };
  bucket.calls += 1;
  if (success) bucket.successes += 1;
  else bucket.failures += 1;
  bucket.totalMs += Math.max(0, durationMs);
  tools[toolName] = bucket;

  const next: ToolAuditStatsRecord = {
    id,
    tenant_id: tenantId,
    type: "tool_audit_stats",
    tools,
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, next);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listToolAudits(
  tenantId: string,
  limit = 50
): Promise<ToolAuditRecord[]> {
  if (!tenantId) return [];
  const capped = Math.min(Math.max(1, limit), 200);

  try {
    const items = await scanItems<ToolAuditRecord>(
      tableNames.profiles,
      "#type = :type AND tenant_id = :tid",
      { ":type": "tool_audit", ":tid": tenantId },
      { "#type": "type" }
    );

    return (items || [])
      .filter((a) => a && a.type === "tool_audit")
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, capped);
  } catch (err) {
    console.warn("[tool-audit] list failed:", err);
    return [];
  }
}

export async function getToolAuditStats(
  tenantId: string
): Promise<ToolAuditStatsRecord | null> {
  if (!tenantId) return null;
  try {
    return await getItem<ToolAuditStatsRecord>(tableNames.profiles, {
      id: statsId(tenantId),
    });
  } catch (err) {
    console.warn("[tool-audit] get stats failed:", err);
    return null;
  }
}
