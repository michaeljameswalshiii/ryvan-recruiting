/**
 * Minimal DynamoDB access for Trio MCP (leads + jobs + events).
 * Mirrors table naming from the main app; tenant_id isolation on every call.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const region =
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  "us-east-1";

const leadsTable = process.env.DYNAMODB_LEADS_TABLE || "turnkey-leads";
const jobsTable = process.env.DYNAMODB_JOBS_TABLE || "turnkey-jobs";
const eventsTable = process.env.DYNAMODB_EVENTS_TABLE || "turnkey-events";

function client(): DynamoDBClient {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  return new DynamoDBClient({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined, // default credential chain
  });
}

export type LeadRow = {
  id: string;
  tenant_id: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  status?: string;
  source?: string;
  location?: string;
  notes?: string;
  linkedJobs?: unknown[];
  created_at?: string;
  modified_at?: string;
  [key: string]: unknown;
};

export type JobRow = {
  id: string;
  tenant_id: string;
  title?: string;
  status?: string;
  companyName?: string;
  location?: string;
  employmentType?: string;
  showOnWebsite?: boolean;
  candidates?: unknown[];
  created_at?: string;
  [key: string]: unknown;
};

export async function listLeads(tenantId: string): Promise<LeadRow[]> {
  const res = await client().send(
    new QueryCommand({
      TableName: leadsTable,
      KeyConditionExpression: "tenant_id = :tenantId",
      ExpressionAttributeValues: marshall({ ":tenantId": tenantId }),
    })
  );
  return (res.Items || []).map((i) => unmarshall(i) as LeadRow);
}

export async function getLead(
  tenantId: string,
  leadId: string
): Promise<LeadRow | null> {
  const res = await client().send(
    new GetItemCommand({
      TableName: leadsTable,
      Key: marshall({ tenant_id: tenantId, id: leadId }),
    })
  );
  if (!res.Item) return null;
  return unmarshall(res.Item) as LeadRow;
}

export async function listJobs(tenantId: string): Promise<JobRow[]> {
  const res = await client().send(
    new QueryCommand({
      TableName: jobsTable,
      KeyConditionExpression: "tenant_id = :tenantId",
      ExpressionAttributeValues: marshall({ ":tenantId": tenantId }),
    })
  );
  return (res.Items || []).map((i) => unmarshall(i) as JobRow);
}

/**
 * Record a candidate activity note (same PK shape as app events).
 */
export async function putCandidateNote(input: {
  tenantId: string;
  candidateId: string;
  noteText: string;
  noteType?: string;
  createdBy?: string;
}): Promise<{ eventId: string; createdAt: string }> {
  const createdAt = new Date().toISOString();
  const noteType = input.noteType || "Note";
  const createdBy = input.createdBy || "mcp-claude";
  const eventId = `${input.candidateId}-${createdAt}`;

  const item = {
    PK: `ENTITY#candidate#${input.candidateId}`,
    SK: `EVENT#${createdAt}`,
    GSI1PK: `TENANT#${input.tenantId}`,
    GSI1SK: `EVENT#${createdAt}`,
    tenantId: input.tenantId,
    entityId: input.candidateId,
    entityType: "candidate",
    eventType: "NOTE",
    title: `Note - ${noteType}`,
    description:
      input.noteText.substring(0, 100) +
      (input.noteText.length > 100 ? "..." : ""),
    metadata: {
      noteText: input.noteText,
      noteType,
      noteTypeLabel: noteType,
      changedBy: createdBy,
      via: "mcp",
    },
    createdAt,
    createdBy,
  };

  await client().send(
    new PutItemCommand({
      TableName: eventsTable,
      Item: marshall(item, { removeUndefinedValues: true }),
    })
  );

  return { eventId, createdAt };
}

export function summarizeLead(l: LeadRow) {
  const linked = Array.isArray(l.linkedJobs) ? l.linkedJobs.length : 0;
  return {
    id: l.id,
    name: l.name || null,
    email: l.email || null,
    phone: l.phone || null,
    title: l.title || null,
    status: l.status || null,
    source: l.source || null,
    location: l.location || null,
    linkedJobCount: linked,
    createdAt: l.created_at || null,
    modifiedAt: l.modified_at || null,
  };
}

export function summarizeJob(j: JobRow) {
  const candidates = Array.isArray(j.candidates) ? j.candidates.length : 0;
  return {
    id: j.id,
    title: j.title || null,
    status: j.status || null,
    companyName: j.companyName || null,
    location: j.location || null,
    employmentType: j.employmentType || null,
    showOnWebsite: j.showOnWebsite !== false,
    candidateCount: candidates,
    createdAt: j.created_at || null,
  };
}
