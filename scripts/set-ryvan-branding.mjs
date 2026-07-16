import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve(root, ".env.production"));

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const table = process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
const ids = ["tenant-2024-001", "tenant-1780937012560-9ictwkn4e"];

for (const id of ids) {
  await client.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { id: { S: id } },
      UpdateExpression:
        "SET logo_url = :u, primary_color = :c, careers_tagline = :t",
      ExpressionAttributeValues: {
        ":u": { S: "/branding/ryvan-logo.jpg" },
        ":c": { S: "#1d4ed8" },
        ":t": {
          S: "Join our network — open roles placed by RYVAN Recruiting.",
        },
      },
    })
  );
  console.log("updated", id);
}
