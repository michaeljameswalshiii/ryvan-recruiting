/**
 * Backfill / repair login audit history in turnkey-security-audit.
 *
 * 1) Re-attribute auth.* events with tenant_id "unknown" to the user's real tenant (by email).
 * 2) For user profiles that never appear in login.success, seed an approximate historical
 *    entry from profile created_at (clearly labeled as approximate).
 *
 * Never stores passwords.
 *
 * Usage: node scripts/backfill-login-audit.mjs
 * Requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.
 */

import { randomUUID } from "crypto";
import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const AUDIT =
  process.env.DYNAMODB_SECURITY_AUDIT_TABLE || "turnkey-security-audit";
const PROFILES = process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";

const client = new DynamoDBClient({ region });

async function scanAll(table, extra = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await client.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey,
        ...extra,
      })
    );
    for (const raw of res.Items || []) {
      items.push(unmarshall(raw));
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function isUserProfile(p) {
  if (!p?.email || !p?.tenant_id) return false;
  // Real users have role and/or password_hash; skip sequence/tool rows mixed into table
  if (p.password_hash || p.role) return true;
  if (p.type && p.type !== "profile" && p.type !== "user") return false;
  return Boolean(p.full_name || p.name);
}

function isLoginish(action) {
  const a = String(action || "");
  return (
    a.startsWith("auth.login") ||
    a === "auth.logout" ||
    a.startsWith("auth.mfa")
  );
}

async function main() {
  console.log("[backfill-login-audit] scanning profiles…");
  const profiles = await scanAll(PROFILES, {
    ProjectionExpression:
      "id, email, tenant_id, #r, full_name, #n, password_hash, created_at, createdAt, #t",
    ExpressionAttributeNames: {
      "#r": "role",
      "#n": "name",
      "#t": "type",
    },
  });

  const emailToTenant = new Map();
  const emailToProfile = new Map();
  for (const p of profiles) {
    if (!isUserProfile(p)) continue;
    const e = String(p.email || "")
      .trim()
      .toLowerCase();
    if (!e) continue;
    emailToTenant.set(e, p.tenant_id);
    emailToProfile.set(e, p);
  }
  console.log(
    `[backfill-login-audit] user profiles: ${emailToProfile.size}`
  );

  console.log("[backfill-login-audit] scanning security audit…");
  const audits = await scanAll(AUDIT);
  const loginish = audits.filter((a) => isLoginish(a.action));
  const byTenant = {};
  for (const a of loginish) {
    const t = a.tenant_id || "unknown";
    byTenant[t] = (byTenant[t] || 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        totalAudit: audits.length,
        loginish: loginish.length,
        byTenant,
      },
      null,
      2
    )
  );

  const unknown = loginish.filter(
    (a) => !a.tenant_id || a.tenant_id === "unknown"
  );

  let moved = 0;
  let skippedNoTenant = 0;
  let errors = 0;

  for (const a of unknown) {
    const email = String(a.actorEmail || "")
      .trim()
      .toLowerCase();
    const tenantId = emailToTenant.get(email);
    if (!tenantId) {
      skippedNoTenant++;
      continue;
    }
    try {
      const id = a.id || randomUUID();
      const createdAt = a.createdAt || new Date().toISOString();
      // Preserve original sort key for chronological order when present
      const sk =
        a.sk && String(a.sk).startsWith("AUDIT#")
          ? a.sk
          : `AUDIT#${createdAt}#${id}`;
      const meta =
        typeof a.meta === "object" && a.meta ? { ...a.meta } : {};
      meta.backfilledFrom = "unknown";
      if (!meta.authMethod) meta.authMethod = "password";

      const item = {
        ...a,
        tenant_id: tenantId,
        sk,
        id,
        type: "security_audit",
        createdAt,
        actorEmail: email,
        meta,
      };

      await client.send(
        new PutItemCommand({
          TableName: AUDIT,
          Item: marshall(item, { removeUndefinedValues: true }),
        })
      );

      if (a.tenant_id && a.sk && (a.tenant_id !== tenantId || a.sk !== sk)) {
        await client.send(
          new DeleteItemCommand({
            TableName: AUDIT,
            Key: marshall({ tenant_id: a.tenant_id, sk: a.sk }),
          })
        );
      } else if (a.tenant_id === "unknown" && a.sk) {
        await client.send(
          new DeleteItemCommand({
            TableName: AUDIT,
            Key: marshall({ tenant_id: "unknown", sk: a.sk }),
          })
        );
      }
      moved++;
    } catch (e) {
      errors++;
      console.error("[move fail]", email, e.message);
    }
  }

  // Build set of emails that already have a successful login event (any tenant)
  const successEmails = new Set();
  for (const a of loginish) {
    if (a.action === "auth.login.success") {
      successEmails.add(
        String(a.actorEmail || "")
          .trim()
          .toLowerCase()
      );
    }
  }
  // Also count newly moved
  for (const a of unknown) {
    if (a.action === "auth.login.success") {
      const e = String(a.actorEmail || "")
        .trim()
        .toLowerCase();
      if (emailToTenant.has(e)) successEmails.add(e);
    }
  }

  let seeded = 0;
  for (const [email, p] of emailToProfile) {
    if (successEmails.has(email)) continue;
    const when = p.created_at || p.createdAt;
    if (!when) continue;
    const ms = Date.parse(when);
    if (Number.isNaN(ms)) continue;
    const createdAt = new Date(ms).toISOString();
    const id = randomUUID();
    const sk = `AUDIT#${createdAt}#${id}`;
    const item = {
      tenant_id: p.tenant_id,
      sk,
      id,
      type: "security_audit",
      action: "auth.login.success",
      severity: "info",
      actorUserId: p.id,
      actorEmail: email,
      actorRole: p.role || "user",
      summary:
        "Historical account record (approx. first activity from profile create date)",
      meta: {
        authMethod: "password",
        historical: true,
        approximate: true,
        source: "profile.created_at",
      },
      createdAt,
    };
    try {
      await client.send(
        new PutItemCommand({
          TableName: AUDIT,
          Item: marshall(item, { removeUndefinedValues: true }),
        })
      );
      seeded++;
      successEmails.add(email);
    } catch (e) {
      errors++;
      console.error("[seed fail]", email, e.message);
    }
  }

  // Final counts per tenant for login.success
  const final = await scanAll(AUDIT);
  const finalLogin = final.filter((a) => isLoginish(a.action));
  const finalByTenant = {};
  for (const a of finalLogin) {
    const t = a.tenant_id || "unknown";
    finalByTenant[t] = finalByTenant[t] || {
      success: 0,
      failure: 0,
      logout: 0,
      other: 0,
    };
    if (a.action === "auth.login.success") finalByTenant[t].success++;
    else if (a.action === "auth.login.failure") finalByTenant[t].failure++;
    else if (a.action === "auth.logout") finalByTenant[t].logout++;
    else finalByTenant[t].other++;
  }

  console.log(
    JSON.stringify(
      {
        moved,
        skippedNoTenant,
        seededFromProfileCreate: seeded,
        errors,
        finalByTenant,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
