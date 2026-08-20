/**
 * Many-to-many user ownership for tenant objects.
 * Assignment rows and their append-only audit events share turnkey-events.
 * @serverOnly
 */

import { randomUUID } from "crypto";
import { QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {
  eventsTable,
  getDocClient,
  getItem,
  queryItems,
} from "../dynamodb";

export const ASSIGNABLE_OBJECT_TYPES = [
  "candidate",
  "company",
  "job",
  "contact",
] as const;

export type AssignableObjectType = (typeof ASSIGNABLE_OBJECT_TYPES)[number];
export type AssignmentRole =
  | "owner"
  | "account_manager"
  | "recruiter"
  | "collaborator";

export interface ObjectAssignment {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  tenantId: string;
  objectType: AssignableObjectType;
  objectId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: AssignmentRole;
  assignedAt: string;
  assignedByUserId: string;
  assignedByEmail: string;
}

function objectPK(
  tenantId: string,
  objectType: AssignableObjectType,
  objectId: string,
) {
  return `TENANT#${tenantId}#ENTITY#${objectType}#${objectId}`;
}

function assignmentSK(userId: string) {
  return `ASSIGNMENT#${userId}`;
}

/** Prod CDK names this TenantEventsIndex; some local tables used GSI1. */
const TENANT_ASSIGNMENT_INDEXES = ["TenantEventsIndex", "GSI1"] as const;

function tenantIdsToTry(tenantId: string): string[] {
  const list = [tenantId];
  if (tenantId.startsWith("tenant-")) {
    const bare = tenantId.replace(/^tenant-/, "");
    if (bare && !list.includes(bare)) list.push(bare);
  } else if (!list.includes(`tenant-${tenantId}`)) {
    list.push(`tenant-${tenantId}`);
  }
  return list;
}

function isAssignmentForType(
  row: ObjectAssignment,
  objectType: AssignableObjectType,
): boolean {
  if (row.objectType === objectType) return true;
  const sk = String(row.GSI1SK || "");
  return sk.startsWith("ASSIGNMENT#") && sk.includes(`#${objectType}#`);
}

/** All assignments of one object type for a tenant (list Owner columns). */
export async function listObjectAssignmentsForType(
  tenantId: string,
  objectType: AssignableObjectType,
): Promise<ObjectAssignment[]> {
  const items: ObjectAssignment[] = [];
  const seen = new Set<string>();

  for (const tid of tenantIdsToTry(tenantId)) {
    let queried = false;
    for (const indexName of TENANT_ASSIGNMENT_INDEXES) {
      try {
        let startKey: Record<string, unknown> | undefined;
        do {
          const response = await getDocClient().send(
            new QueryCommand({
              TableName: eventsTable,
              IndexName: indexName,
              KeyConditionExpression:
                "GSI1PK = :pk AND begins_with(GSI1SK, :prefix)",
              ExpressionAttributeValues: {
                ":pk": `TENANT#${tid}`,
                ":prefix": "ASSIGNMENT#",
              },
              ExclusiveStartKey: startKey,
            }),
          );
          queried = true;
          for (const item of response.Items || []) {
            const row = item as ObjectAssignment;
            const key = `${row.PK || ""}#${row.SK || ""}#${row.objectId || ""}#${row.userId || ""}`;
            if (seen.has(key)) continue;
            if (!isAssignmentForType(row, objectType)) continue;
            seen.add(key);
            items.push(row);
          }
          startKey = response.LastEvaluatedKey as
            | Record<string, unknown>
            | undefined;
        } while (startKey);
        if (queried) break;
      } catch (err) {
        console.warn(
          `[listObjectAssignmentsForType] index=${indexName} tenant=${tid}`,
          err,
        );
      }
    }
  }
  return items;
}

function objectIdVariants(objectId: string): string[] {
  const raw = String(objectId || "").trim();
  if (!raw) return [];
  const out = [raw];
  if (raw.includes("#")) {
    const tail = raw.split("#").pop();
    if (tail) out.push(tail);
  }
  return [...new Set(out)];
}

export async function listObjectAssignments(
  tenantId: string,
  objectType: AssignableObjectType,
  objectId: string,
): Promise<ObjectAssignment[]> {
  const items: ObjectAssignment[] = [];
  const seen = new Set<string>();
  const allowedTenants = new Set(tenantIdsToTry(tenantId));

  for (const tid of tenantIdsToTry(tenantId)) {
    for (const oid of objectIdVariants(objectId)) {
      try {
        const result = await queryItems<ObjectAssignment>(
          eventsTable,
          "PK = :pk AND begins_with(SK, :prefix)",
          {
            ":pk": objectPK(tid, objectType, oid),
            ":prefix": "ASSIGNMENT#",
          },
        );
        for (const row of result.items || []) {
          const key = `${row.PK || ""}#${row.SK || ""}`;
          if (seen.has(key)) continue;
          if (row.tenantId && !allowedTenants.has(row.tenantId)) continue;
          seen.add(key);
          items.push(row);
        }
      } catch (err) {
        console.warn(
          `[listObjectAssignments] tenant=${tid} object=${oid}`,
          err,
        );
      }
    }
  }

  return items.sort((a, b) =>
    String(a.userName || "").localeCompare(String(b.userName || "")),
  );
}

/** Same source as the company page pill — used to fill list Owner columns. */
export async function listObjectAssignmentsForObjects(
  tenantId: string,
  objectType: AssignableObjectType,
  objectIds: string[],
): Promise<ObjectAssignment[]> {
  const unique = [...new Set(objectIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const out: ObjectAssignment[] = [];
  const seen = new Set<string>();
  const concurrency = 8;
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const batches = await Promise.all(
      chunk.map((id) => listObjectAssignments(tenantId, objectType, id)),
    );
    for (const rows of batches) {
      for (const row of rows) {
        const key = `${row.PK || ""}#${row.SK || ""}#${row.objectId || ""}#${row.userId || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
    }
  }
  return out;
}

function assignmentAuditItem(
  action: "USER_ASSIGNED" | "USER_UNASSIGNED",
  assignment: ObjectAssignment,
  actor: { userId: string; email: string },
) {
  const createdAt = new Date().toISOString();
  return {
    // Use the existing object event partition so assignment changes appear in
    // the same activity timeline as notes, emails, and stage changes.
    PK: `ENTITY#${assignment.objectType}#${assignment.objectId}`,
    SK: `EVENT#${createdAt}#${randomUUID()}`,
    GSI1PK: `TENANT#${assignment.tenantId}`,
    GSI1SK: `EVENT#${createdAt}`,
    tenantId: assignment.tenantId,
    entityType: assignment.objectType,
    entityId: assignment.objectId,
    eventType: action,
    title: action === "USER_ASSIGNED" ? "User assigned" : "User unassigned",
    description: `${assignment.userName || assignment.userEmail} ${
      action === "USER_ASSIGNED" ? "assigned to" : "removed from"
    } this ${assignment.objectType}.`,
    metadata: {
      assignmentUserId: assignment.userId,
      assignmentUserName: assignment.userName,
      assignmentUserEmail: assignment.userEmail,
      assignmentRole: assignment.role,
      actorUserId: actor.userId,
      actorEmail: actor.email,
    },
    createdAt,
    createdBy: actor.email || actor.userId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
  };
}

export async function assignUserToObject(input: {
  tenantId: string;
  objectType: AssignableObjectType;
  objectId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: AssignmentRole;
  actorUserId: string;
  actorEmail: string;
}): Promise<ObjectAssignment> {
  const assignedAt = new Date().toISOString();
  const assignment: ObjectAssignment = {
    PK: objectPK(input.tenantId, input.objectType, input.objectId),
    SK: assignmentSK(input.userId),
    GSI1PK: `TENANT#${input.tenantId}`,
    GSI1SK: `ASSIGNMENT#${input.userId}#${input.objectType}#${input.objectId}`,
    tenantId: input.tenantId,
    objectType: input.objectType,
    objectId: input.objectId,
    userId: input.userId,
    userName: input.userName,
    userEmail: input.userEmail,
    role: input.role,
    assignedAt,
    assignedByUserId: input.actorUserId,
    assignedByEmail: input.actorEmail,
  };

  const existing = await getItem<ObjectAssignment>(eventsTable, {
    PK: assignment.PK,
    SK: assignment.SK,
  });
  if (
    existing?.tenantId === input.tenantId &&
    existing.role === input.role
  ) {
    return existing;
  }

  const audit = assignmentAuditItem("USER_ASSIGNED", assignment, {
    userId: input.actorUserId,
    email: input.actorEmail,
  });
  await getDocClient().send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: eventsTable, Item: assignment } },
        { Put: { TableName: eventsTable, Item: audit } },
      ],
    }),
  );
  return assignment;
}

export async function unassignUserFromObject(input: {
  tenantId: string;
  objectType: AssignableObjectType;
  objectId: string;
  userId: string;
  actorUserId: string;
  actorEmail: string;
}): Promise<boolean> {
  const key = {
    PK: objectPK(input.tenantId, input.objectType, input.objectId),
    SK: assignmentSK(input.userId),
  };
  const assignment = await getItem<ObjectAssignment>(eventsTable, key);
  if (!assignment || assignment.tenantId !== input.tenantId) return false;

  const audit = assignmentAuditItem("USER_UNASSIGNED", assignment, {
    userId: input.actorUserId,
    email: input.actorEmail,
  });
  await getDocClient().send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: eventsTable, Key: key } },
        { Put: { TableName: eventsTable, Item: audit } },
      ],
    }),
  );
  return true;
}
