/**
 * Create tenant-platform and move all site_admin profiles onto it.
 *
 * Usage (with AWS creds):
 *   node scripts/migrate-site-admins-to-platform.mjs
 */

import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const TENANTS = process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
const PROFILES = process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";
const PLATFORM_ID = "tenant-platform";

const client = new DynamoDBClient({ region });

async function scanAll(table) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await client.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey })
    );
    for (const raw of res.Items || []) items.push(unmarshall(raw));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function isSiteAdminRole(role) {
  const r = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    r === "site_admin" ||
    r === "siteadmin" ||
    r === "super_admin" ||
    r === "superadmin"
  );
}

async function main() {
  const now = new Date().toISOString();

  // 1) Ensure platform tenant
  const tenants = await scanAll(TENANTS);
  let platform = tenants.find((t) => t.id === PLATFORM_ID);
  if (!platform) {
    platform = {
      id: PLATFORM_ID,
      name: "Platform",
      subdomain: "platform",
      created_at: now,
      updated_at: now,
      plan: "enterprise",
      seat_limit: 100,
      status: "active",
      kind: "platform",
    };
    await client.send(
      new PutItemCommand({
        TableName: TENANTS,
        Item: marshall(platform, { removeUndefinedValues: true }),
      })
    );
    console.log("[migrate] created tenant-platform");
  } else {
    console.log("[migrate] tenant-platform already exists");
  }

  // 2) Move site admins
  const profiles = await scanAll(PROFILES);
  const siteAdmins = profiles.filter(
    (p) =>
      p.email &&
      isSiteAdminRole(p.role) &&
      !String(p.type || "").includes("list_builder")
  );

  let moved = 0;
  for (const p of siteAdmins) {
    if (p.tenant_id === PLATFORM_ID) {
      console.log(`[migrate] already on platform: ${p.email}`);
      continue;
    }
    await client.send(
      new UpdateItemCommand({
        TableName: PROFILES,
        Key: marshall({ id: p.id }),
        UpdateExpression: "SET tenant_id = :t, updated_at = :u",
        ExpressionAttributeValues: marshall({
          ":t": PLATFORM_ID,
          ":u": now,
        }),
      })
    );
    console.log(
      `[migrate] moved ${p.email} ${p.tenant_id} → ${PLATFORM_ID}`
    );
    moved++;
  }

  console.log(
    JSON.stringify(
      {
        platformTenant: PLATFORM_ID,
        siteAdminCount: siteAdmins.length,
        moved,
        emails: siteAdmins.map((p) => p.email),
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
