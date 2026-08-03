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

export async function listSecurityAudit(
  tenantId: string,
  opts?: { limit?: number }
): Promise<SecurityAuditEvent[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  try {
    const res = await getClient().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "tenant_id = :t",
        ExpressionAttributeValues: marshall({ ":t": tenantId }),
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return (res.Items || []).map(
      (i) => unmarshall(i) as SecurityAuditEvent
    );
  } catch (err) {
    console.error("[security-audit] list failed:", err);
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
