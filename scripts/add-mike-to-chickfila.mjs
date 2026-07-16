/**
 * One-shot: add Mike Walsh as a real company contact under Chick Fil-A
 * so he appears on /dashboard/contact-info
 */
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";

function awsJson(args) {
  const r = spawnSync("aws", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "aws failed");
  return JSON.parse(r.stdout);
}

const TENANT = "tenant-2024-001";
const COMPANY_ID = "a2e74b47-846f-4923-a77b-c851a0a08430";
const CONTACT_ID = "b38456d3-08bc-4b77-8e2f-484018d66c7b"; // reuse AI's claimed id

// Get full company item
const got = awsJson([
  "dynamodb",
  "get-item",
  "--table-name",
  "turnkey-clients",
  "--key",
  JSON.stringify({
    tenant_id: { S: TENANT },
    id: { S: COMPANY_ID },
  }),
  "--region",
  "us-east-1",
  "--output",
  "json",
]);

if (!got.Item) {
  console.error("Company not found");
  process.exit(1);
}

const item = got.Item;
const existing = item.contacts?.L || [];

// Skip if already present
const already = existing.some(
  (c) =>
    c.M?.id?.S === CONTACT_ID ||
    /mike\s*walsh/i.test(c.M?.name?.S || "")
);
if (already) {
  console.log("Mike Walsh already on Chick Fil-A contacts — nothing to do");
  process.exit(0);
}

const now = new Date().toISOString();
const newContact = {
  M: {
    id: { S: CONTACT_ID },
    companyId: { S: COMPANY_ID },
    name: { S: "Mike Walsh" },
    title: { S: "" },
    email: { S: "" },
    phone: { S: "" },
    isPrimary: { BOOL: false },
    notes: { S: "Added from AI-created candidate so he appears on Contact Info" },
    createdAt: { S: now },
    updatedAt: { S: now },
  },
};

const contacts = [...existing, newContact];

awsJson([
  "dynamodb",
  "update-item",
  "--table-name",
  "turnkey-clients",
  "--key",
  JSON.stringify({
    tenant_id: { S: TENANT },
    id: { S: COMPANY_ID },
  }),
  "--update-expression",
  "SET #contacts = :contacts, #modified_at = :m",
  "--expression-attribute-names",
  JSON.stringify({
    "#contacts": "contacts",
    "#modified_at": "modified_at",
  }),
  "--expression-attribute-values",
  JSON.stringify({
    ":contacts": { L: contacts },
    ":m": { S: now },
  }),
  "--region",
  "us-east-1",
  "--return-values",
  "UPDATED_NEW",
  "--output",
  "json",
]);

console.log(
  JSON.stringify(
    {
      ok: true,
      company: "Chick Fil-A",
      companyId: COMPANY_ID,
      contactId: CONTACT_ID,
      contactName: "Mike Walsh",
      contactCount: contacts.length,
      message:
        "Mike Walsh is now a company contact — refresh /dashboard/contact-info",
    },
    null,
    2
  )
);
