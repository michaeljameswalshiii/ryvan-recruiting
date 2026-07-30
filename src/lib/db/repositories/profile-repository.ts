/**
 * Profile Repository
 * @serverOnly
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import type { Profile, MemberStatus } from "@/lib/schemas/profile";
import { normalizeRole } from "@/lib/roles";

export type { Profile };

export interface CreateProfileInput {
  tenant_id: string;
  email: string;
  full_name: string;
  role?: string;
  id?: string;
  status?: MemberStatus | string;
  invited_at?: string;
  invited_by?: string;
  invite_token_hash?: string;
  invite_expires_at?: string;
  password_hash?: string;
}

export interface UpdateProfileInput {
  full_name?: string;
  role?: string;
  status?: MemberStatus | string;
  invite_token_hash?: string | null;
  invite_expires_at?: string | null;
  invited_at?: string | null;
  invited_by?: string | null;
  password_hash?: string;
}

export const createProfileSchema = z.object({
  tenant_id: z.string().min(1),
  email: z.string().email(),
  full_name: z.string().min(1).max(100),
  role: z.string().optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: z.string().optional(),
  status: z.enum(["active", "invited", "disabled"]).optional(),
});

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({
  region,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function getProfilesTable(): string {
  return process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";
}

/** Safe public member shape — no secrets */
export function toPublicMember(profile: Profile) {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: normalizeRole(profile.role),
    status: (profile.status as MemberStatus) || "active",
    created_at: profile.created_at,
    invited_at: profile.invited_at,
    updated_at: profile.updated_at,
  };
}

/**
 * The profiles Dynamo table also stores list-builder jobs, sequence defs,
 * AI credentials, indexes, etc. (all keyed by tenant_id). Team UI / seat
 * counts must only count real people.
 */
const NON_MEMBER_TYPES = new Set([
  "list_builder",
  "list_builder_index",
  "list_builder_public_index",
  "candidate_list_builder",
  "candidate_list_builder_index",
  "candidate_list_builder_public_index",
  "sequence",
  "sequence_definition",
  "sequence_enrollment",
  "sequence_index",
  "ai_credentials",
  "tool_audit",
]);

const NON_MEMBER_ID_PREFIXES = [
  "lb-job#",
  "lb-index#",
  "lb-public#",
  "clb-job#",
  "clb-index#",
  "clb-public#",
  "fill-run#",
  "fill-index#",
  "fill-public#",
  "goal-run#",
  "goal-index#",
  "goal-public#",
  "seq-",
  "seq#",
  "sequence#",
  "ai-creds#",
  "ai_creds#",
  "aicred#",
];

export function isUserProfile(item: unknown): item is Profile {
  if (!item || typeof item !== "object") return false;
  const p = item as Record<string, unknown>;
  const id = String(p.id || "");
  if (!id) return false;

  // Explicit entity type on non-member rows
  const type = p.type != null ? String(p.type) : "";
  if (type && NON_MEMBER_TYPES.has(type)) return false;
  // Real members rarely set type; if they do, only allow profile/user/member
  if (type && !["profile", "user", "member", ""].includes(type)) {
    // Unknown typed rows (jobs, indexes) are not people
    if (
      type.includes("list_builder") ||
      type.includes("sequence") ||
      type.includes("credential") ||
      type.includes("index")
    ) {
      return false;
    }
  }

  // Prefixed ids used by jobs/indexes co-stored in this table
  if (NON_MEMBER_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return false;
  }
  // Composite keys like lb-job#tenant#uuid never belong to people
  if (id.includes("#")) return false;

  // Members always have an email
  const email = String(p.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@") || email.length < 5) return false;

  // Job statuses that leaked into team UI (list-builder / sequences)
  const status = String(p.status || "")
    .trim()
    .toLowerCase();
  if (
    status &&
    ![
      "active",
      "invited",
      "disabled",
      // legacy blanks treated as active below
    ].includes(status)
  ) {
    // awaiting_import, stopped, running, queued, paused, completed, failed, cancelled
    return false;
  }

  return true;
}

/** Filter any mixed table scan/query down to real team members. */
export function filterUserProfiles(items: unknown[]): Profile[] {
  return items.filter(isUserProfile).map((p) => p as Profile);
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  const cacheKey = `profile:${userId}`;
  const cached = await getCached<Profile>(cacheKey);
  if (cached) return cached;

  try {
    const response = await dynamoClient.send(
      new GetItemCommand({
        TableName: getProfilesTable(),
        Key: { id: { S: userId } },
      })
    );
    if (!response.Item) return null;
    const profile = unmarshall(response.Item) as Profile;
    await setCached(cacheKey, profile, 300);
    return profile;
  } catch (error) {
    console.error("getProfileById error:", error);
    return null;
  }
}

export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const normalized = email.toLowerCase();
  const cacheKey = `profile:email:${normalized}`;
  const cached = await getCached<Profile>(cacheKey);
  if (cached) return cached;

  try {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: getProfilesTable(),
          IndexName: "email-index",
          KeyConditionExpression: "email = :email",
          ExpressionAttributeValues: { ":email": { S: normalized } },
        })
      );
      if (response.Items?.length) {
        const profile = unmarshall(response.Items[0]) as Profile;
        await setCached(cacheKey, profile, 300);
        return profile;
      }
    } catch {
      // GSI may not exist — scan fallback
    }

    const scan = await dynamoClient.send(
      new ScanCommand({
        TableName: getProfilesTable(),
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": { S: normalized } },
      })
    );
    if (!scan.Items?.length) return null;
    const profile = unmarshall(scan.Items[0]) as Profile;
    await setCached(cacheKey, profile, 300);
    return profile;
  } catch (error) {
    console.error("getProfileByEmail error:", error);
    return null;
  }
}

export async function getProfileByInviteTokenHash(
  tokenHash: string
): Promise<Profile | null> {
  try {
    const scan = await dynamoClient.send(
      new ScanCommand({
        TableName: getProfilesTable(),
        FilterExpression: "invite_token_hash = :h",
        ExpressionAttributeValues: { ":h": { S: tokenHash } },
      })
    );
    if (!scan.Items?.length) return null;
    return unmarshall(scan.Items[0]) as Profile;
  } catch (error) {
    console.error("getProfileByInviteTokenHash error:", error);
    return null;
  }
}

export async function getProfilesByTenant(
  tenantId: string
): Promise<Profile[]> {
  const cacheKey = `profiles:tenant:${tenantId}`;
  const cached = await getCached<Profile[]>(cacheKey);
  // Re-filter: older cache entries may include list-builder jobs etc.
  if (cached) return filterUserProfiles(cached);

  try {
    try {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: getProfilesTable(),
          IndexName: "tenant-index",
          KeyConditionExpression: "tenant_id = :tenant_id",
          ExpressionAttributeValues: { ":tenant_id": { S: tenantId } },
        })
      );
      const profiles = filterUserProfiles(
        (response.Items || []).map((item) => unmarshall(item))
      );
      await setCached(cacheKey, profiles, 300);
      return profiles;
    } catch {
      // GSI fallback
    }

    const scan = await dynamoClient.send(
      new ScanCommand({
        TableName: getProfilesTable(),
        FilterExpression: "tenant_id = :tenant_id",
        ExpressionAttributeValues: { ":tenant_id": { S: tenantId } },
      })
    );
    const profiles = filterUserProfiles(
      (scan.Items || []).map((item) => unmarshall(item))
    );
    await setCached(cacheKey, profiles, 300);
    return profiles;
  } catch (error) {
    console.error("getProfilesByTenant error:", error);
    return [];
  }
}

/** Seats that count against plan limit */
export function countBillableSeats(profiles: Profile[]): number {
  // Defensive: callers may pass pre-filter rows from older caches
  return filterUserProfiles(profiles).filter((p) => {
    const s = (p.status || "active").toLowerCase();
    return s === "active" || s === "invited";
  }).length;
}

export async function createProfile(
  input: CreateProfileInput
): Promise<Profile> {
  const email = input.email.toLowerCase();
  const profile: Profile = {
    id:
      input.id ||
      `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    tenant_id: input.tenant_id,
    email,
    full_name: input.full_name,
    role: input.role || "user",
    status: input.status || "active",
    created_at: new Date().toISOString(),
    ...(input.invited_at ? { invited_at: input.invited_at } : {}),
    ...(input.invited_by ? { invited_by: input.invited_by } : {}),
    ...(input.invite_token_hash
      ? { invite_token_hash: input.invite_token_hash }
      : {}),
    ...(input.invite_expires_at
      ? { invite_expires_at: input.invite_expires_at }
      : {}),
    ...(input.password_hash ? { password_hash: input.password_hash } : {}),
  };

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: getProfilesTable(),
        Item: marshall(profile, { removeUndefinedValues: true }),
      })
    );
    await invalidateCache(`profiles:tenant:${input.tenant_id}`);
    await invalidateCache(`profile:email:${email}`);
    return profile;
  } catch (error) {
    console.error("createProfile error:", error);
    throw new Error("Failed to create profile");
  }
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<Profile | null> {
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  const removeAttrs: string[] = [];

  if (input.full_name !== undefined) {
    names["#full_name"] = "full_name";
    updates.push("#full_name = :full_name");
    values[":full_name"] = input.full_name;
  }
  if (input.role !== undefined) {
    names["#role"] = "role";
    updates.push("#role = :role");
    values[":role"] = input.role;
  }
  if (input.status !== undefined) {
    names["#status"] = "status";
    updates.push("#status = :status");
    values[":status"] = input.status;
  }
  if (input.password_hash !== undefined) {
    updates.push("password_hash = :password_hash");
    values[":password_hash"] = input.password_hash;
  }

  // Clear invite fields on accept
  if (input.invite_token_hash === null) removeAttrs.push("invite_token_hash");
  else if (input.invite_token_hash !== undefined) {
    updates.push("invite_token_hash = :invite_token_hash");
    values[":invite_token_hash"] = input.invite_token_hash;
  }
  if (input.invite_expires_at === null) removeAttrs.push("invite_expires_at");
  else if (input.invite_expires_at !== undefined) {
    updates.push("invite_expires_at = :invite_expires_at");
    values[":invite_expires_at"] = input.invite_expires_at;
  }

  if (updates.length === 0 && removeAttrs.length === 0) {
    return getProfileById(userId);
  }

  if (updates.length > 0) {
    updates.push("updated_at = :updated_at");
    values[":updated_at"] = new Date().toISOString();
  }

  let updateExpression = "";
  if (updates.length) updateExpression += `SET ${updates.join(", ")}`;
  if (removeAttrs.length) {
    updateExpression += `${updateExpression ? " " : ""}REMOVE ${removeAttrs.join(
      ", "
    )}`;
  }

  try {
    const response = await dynamoClient.send(
      new UpdateItemCommand({
        TableName: getProfilesTable(),
        Key: { id: { S: userId } },
        UpdateExpression: updateExpression,
        ...(Object.keys(values).length
          ? {
              ExpressionAttributeValues: marshall(values, {
                removeUndefinedValues: true,
              }),
            }
          : {}),
        ...(Object.keys(names).length
          ? { ExpressionAttributeNames: names }
          : {}),
        ReturnValues: "ALL_NEW",
      })
    );
    if (!response.Attributes) return null;
    const profile = unmarshall(response.Attributes) as Profile;
    await invalidateCache(`profile:${userId}`);
    await invalidateCache(`profiles:tenant:${profile.tenant_id}`);
    await invalidateCache(`profile:email:${profile.email}`);
    return profile;
  } catch (error) {
    console.error("updateProfile error:", error);
    return null;
  }
}

export async function deleteProfile(userId: string): Promise<boolean> {
  try {
    const existing = await getProfileById(userId);
    const response = await dynamoClient.send(
      new DeleteItemCommand({
        TableName: getProfilesTable(),
        Key: { id: { S: userId } },
        ReturnValues: "ALL_OLD",
      })
    );
    if (!response.Attributes) return false;
    await invalidateCache(`profile:${userId}`);
    if (existing) {
      await invalidateCache(`profiles:tenant:${existing.tenant_id}`);
      await invalidateCache(`profile:email:${existing.email}`);
    }
    return true;
  } catch (error) {
    console.error("deleteProfile error:", error);
    return false;
  }
}

export async function verifyUserTenant(
  userId: string,
  tenantId: string
): Promise<boolean> {
  const profile = await getProfileById(userId);
  return !!profile && profile.tenant_id === tenantId;
}
