/**
 * Rename Ryvan / RyVan tenant branding to RYVAN in DynamoDB.
 * Updates tenant name (and optional company names that match).
 *
 * Usage: node scripts/rename-ryvan-to-ryvan-caps.mjs
 * Loads env from .env.production if present.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(root, ".env.production"));
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const region =
  process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
const client = new DynamoDBClient({
  region,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const TENANTS = process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
const CLIENTS = process.env.DYNAMODB_CLIENTS_TABLE || "turnkey-clients";

function looksLikeRyvan(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.trim();
  // Match Ryvan / RyVan / ryvan as whole brand word, not email domains only
  return /\bryvan\b/i.test(n) || /^ryvan(\s+recruiting)?$/i.test(n);
}

function toRyvanCaps(name) {
  const n = name.trim();
  if (/^ryvan(\s+recruiting)?$/i.test(n)) {
    return /^ryvan\s+recruiting$/i.test(n) ? "RYVAN Recruiting" : "RYVAN";
  }
  // Replace brand word case-insensitively
  return n.replace(/\bRyVan\b/gi, "RYVAN").replace(/\bRyvan\b/gi, "RYVAN");
}

async function scanAll(tableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
      })
    );
    for (const item of res.Items || []) {
      items.push(unmarshall(item));
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function updateTenant(id, name) {
  await client.send(
    new UpdateItemCommand({
      TableName: TENANTS,
      Key: { id: { S: id } },
      UpdateExpression: "SET #n = :n, updated_at = :u",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":n": { S: name },
        ":u": { S: new Date().toISOString() },
      },
    })
  );
}

async function updateClientName(tenantId, id, name) {
  // composite key tables use tenant_id + id
  try {
    await client.send(
      new UpdateItemCommand({
        TableName: CLIENTS,
        Key: {
          tenant_id: { S: tenantId },
          id: { S: id },
        },
        UpdateExpression: "SET #n = :n, updated_at = :u",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: {
          ":n": { S: name },
          ":u": { S: new Date().toISOString() },
        },
      })
    );
    return true;
  } catch {
    try {
      await client.send(
        new UpdateItemCommand({
          TableName: CLIENTS,
          Key: { id: { S: id } },
          UpdateExpression: "SET #n = :n, updated_at = :u",
          ExpressionAttributeNames: { "#n": "name" },
          ExpressionAttributeValues: {
            ":n": { S: name },
            ":u": { S: new Date().toISOString() },
          },
        })
      );
      return true;
    } catch (e) {
      console.warn("  skip client", id, e.message);
      return false;
    }
  }
}

async function main() {
  console.log("Renaming Ryvan → RYVAN in DynamoDB…");
  console.log("Region:", region);
  console.log("Tenants table:", TENANTS);

  const tenants = await scanAll(TENANTS);
  let tenantUpdates = 0;
  for (const t of tenants) {
    if (!looksLikeRyvan(t.name)) continue;
    const next = toRyvanCaps(t.name);
    if (next === t.name) {
      console.log(`  tenant ${t.id}: already "${t.name}"`);
      continue;
    }
    console.log(`  tenant ${t.id}: "${t.name}" → "${next}"`);
    await updateTenant(t.id, next);
    tenantUpdates++;
  }

  let clientUpdates = 0;
  try {
    const companies = await scanAll(CLIENTS);
    for (const c of companies) {
      if (!looksLikeRyvan(c.name)) continue;
      const next = toRyvanCaps(c.name);
      if (next === c.name) continue;
      console.log(`  company ${c.id}: "${c.name}" → "${next}"`);
      const ok = await updateClientName(c.tenant_id || c.tenantId, c.id, next);
      if (ok) clientUpdates++;
    }
  } catch (e) {
    console.warn("Companies table skipped:", e.message);
  }

  console.log(`Done. Tenants updated: ${tenantUpdates}, companies: ${clientUpdates}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
