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

/** All assignments of one object type for a tenant (list Owner columns). */
export async function listObjectAssignmentsForType(
  tenantId: string,
  objectType: AssignableObjectType,
): Promise<ObjectAssignment[]> {
  const items: ObjectAssignment[] = [];
  let startKey: Record<string, unknown> | undefined;
  try {
    do {
      const response = await getDocClient().send(
        new QueryCommand({
          TableName: eventsTable,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :prefix)",
          ExpressionAttributeValues: {
            ":pk": `TENANT#${tenantId}`,
            ":prefix": "ASSIGNMENT#",
          },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of response.Items || []) {
        const row = item as ObjectAssignment;
        if (row.tenantId === tenantId && row.objectType === objectType) {
          items.push(row);
        }
      }
      startKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey);
  } catch (err) {
    console.warn("[listObjectAssignmentsForType]", err);
    return [];
  }
  return items;
}

export async function listObjectAssignments(
  tenantId: string,
  objectType: AssignableObjectType,
  objectId: string,
): Promise<ObjectAssignment[]> {
  const result = await queryItems<ObjectAssignment>(
    eventsTable,
    "PK = :pk AND begins_with(SK, :prefix)",
    {
      ":pk": objectPK(tenantId, objectType, objectId),
      ":prefix": "ASSIGNMENT#",
    },
  );

  return (result.items || [])
    .filter((item) => item.tenantId === tenantId)
    .sort((a, b) => a.userName.localeCompare(b.userName));
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
