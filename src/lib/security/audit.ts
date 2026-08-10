/**
 * Security audit log — silent writes for compliance.
 * Failures never break the primary request.
 *
 * @serverOnly
 */

import { randomUUID } from "crypto";
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const TABLE =
  process.env.DYNAMODB_SECURITY_AUDIT_TABLE || "turnkey-security-audit";

export type AuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.mfa.challenge"
  | "auth.mfa.success"
  | "auth.mfa.failure"
  | "auth.invite.created"
  | "auth.invite.accepted"
  | "admin.member.role_changed"
  | "admin.member.disabled"
  | "admin.security.settings_updated"
  | "security.session.created"
  | string;

export type AuditSeverity = "info" | "warning" | "critical";

export interface SecurityAuditEvent {
  tenant_id: string;
  sk: string;
  id: string;
  action: AuditAction;
  severity: AuditSeverity;
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  type: "security_audit";
}

export interface WriteAuditInput {
  tenantId: string;
  action: AuditAction;
  severity?: AuditSeverity;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetType?: string;
  targetId?: string;
  summary?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

function getClient() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  return new DynamoDBClient({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
}

/** Best-effort audit write — never throws to caller. */
export async function writeSecurityAudit(
  input: WriteAuditInput
): Promise<void> {
  try {
    if (!input.tenantId) return;
    const now = new Date().toISOString();
    const id = randomUUID();
    const sk = `AUDIT#${now}#${id}`;
    const item: SecurityAuditEvent = {
      tenant_id: input.tenantId,
      sk,
      id,
      type: "security_audit",
      action: input.action,
      severity: input.severity || "info",
      actorUserId: input.actorUserId || undefined,
      actorEmail: input.actorEmail || undefined,
      actorRole: input.actorRole || undefined,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      meta: input.meta,
      ip: input.ip || undefined,
      userAgent: input.userAgent
        ? String(input.userAgent).slice(0, 300)
        : undefined,
      createdAt: now,
    };

    await getClient().send(
      new PutItemCommand({
        TableName: TABLE,
        Item: marshall(item, { removeUndefinedValues: true }),
      })
    );
  } catch (err) {
    console.error("[security-audit] write failed:", err);
  }
}

function filterAuditEvents(
  events: SecurityAuditEvent[],
  opts?: {
    actionPrefix?: string;
    actions?: string[];
  }
): SecurityAuditEvent[] {
  let out = events;
  if (opts?.actions?.length) {
    const set = new Set(opts.actions);
    out = out.filter((e) => set.has(String(e.action)));
  } else if (opts?.actionPrefix) {
    const p = opts.actionPrefix;
    out = out.filter((e) => String(e.action || "").startsWith(p));
  }
  return out;
}

export async function listSecurityAudit(
  tenantId: string,
  opts?: {
    limit?: number;
    /** e.g. "auth.login" to keep only login-related rows */
    actionPrefix?: string;
    actions?: string[];
  }
): Promise<SecurityAuditEvent[]> {
  const limit = Math.min(opts?.limit ?? 50, 300);
  try {
    // Over-fetch when filtering so the page still fills after client-side filter
    const queryLimit =
      opts?.actionPrefix || opts?.actions?.length
        ? Math.min(limit * 4, 500)
        : limit;

    const res = await getClient().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "tenant_id = :t",
        ExpressionAttributeValues: marshall({ ":t": tenantId }),
        ScanIndexForward: false,
        Limit: queryLimit,
      })
    );
    let events = (res.Items || []).map(
      (i) => unmarshall(i) as SecurityAuditEvent
    );

    events = filterAuditEvents(events, opts);
    // Newest first
    events.sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );
    return events.slice(0, limit);
  } catch (err) {
    console.error("[security-audit] list failed:", err);
    return [];
  }
}

/**
 * Site-admin: scan all tenants for audit events (login history platform-wide).
 * Volume is small; prefer tenant Query for company admins.
 */
export async function listSecurityAuditAll(opts?: {
  limit?: number;
  actionPrefix?: string;
  actions?: string[];
}): Promise<SecurityAuditEvent[]> {
  const limit = Math.min(opts?.limit ?? 150, 500);
  try {
    const items: SecurityAuditEvent[] = [];
    let ExclusiveStartKey: Record<string, any> | undefined;
    do {
      const res = await getClient().send(
        new ScanCommand({
          TableName: TABLE,
          ExclusiveStartKey,
        })
      );
      for (const raw of res.Items || []) {
        items.push(unmarshall(raw) as SecurityAuditEvent);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
      if (items.length >= 2000) break;
    } while (ExclusiveStartKey);

    let events = filterAuditEvents(items, opts);
    events.sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );
    return events.slice(0, limit);
  } catch (err) {
    console.error("[security-audit] listAll failed:", err);
    return [];
  }
}

/** Extract IP / UA from a Request for audit metadata */
export function requestAuditMeta(request: {
  headers: Headers;
}): { ip?: string; userAgent?: string } {
  const xf = request.headers.get("x-forwarded-for");
  const ip =
    (xf && xf.split(",")[0]?.trim()) ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  return { ip: ip || undefined, userAgent: userAgent || undefined };
}
