/**
 * Default ownership for newly created CRM records.
 *
 * Default behavior: assign the user who created the record.
 * Company admins can enable a fixed default owner in tenant settings;
 * when that is off (or the fixed user is invalid), creator always wins.
 *
 * @serverOnly
 */

import { getTenantById } from "@/lib/db/repositories/tenant-repository";
import {
  assignUserToObject,
  type AssignableObjectType,
  type AssignmentRole,
} from "@/lib/db/repositories/object-assignment-repository";
import { getProfileById } from "@/lib/db/repositories/profile-repository";

export type TenantOwnershipSettings = {
  /** When true, new records get defaultOwnerUserId (if valid) instead of the creator. */
  useFixedDefaultOwner: boolean;
  /** Team member user id used when useFixedDefaultOwner is true. */
  defaultOwnerUserId?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_TENANT_OWNERSHIP: TenantOwnershipSettings = {
  useFixedDefaultOwner: false,
};

export type CreateActorContext = {
  userId: string;
  email?: string | null;
};

export function parseTenantOwnership(raw: unknown): TenantOwnershipSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TENANT_OWNERSHIP };
  }
  const o = raw as Record<string, unknown>;
  const defaultOwnerUserId =
    typeof o.defaultOwnerUserId === "string" && o.defaultOwnerUserId.trim()
      ? o.defaultOwnerUserId.trim()
      : undefined;
  return {
    useFixedDefaultOwner: o.useFixedDefaultOwner === true,
    defaultOwnerUserId,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : undefined,
  };
}

/** Match UI labels: candidates use Account Rep; others use Owners. */
export function defaultAssignmentRole(
  objectType: AssignableObjectType,
): AssignmentRole {
  if (objectType === "candidate") return "account_manager";
  return "owner";
}

/**
 * Resolve who should own a new record.
 * - Fixed default owner (when enabled + valid active teammate) wins.
 * - Otherwise the creator.
 * - Returns null if nobody can be resolved.
 */
export async function resolveDefaultOwnerUser(input: {
  tenantId: string;
  actorUserId: string;
}): Promise<{
  userId: string;
  userName: string;
  userEmail: string;
  source: "fixed" | "creator";
} | null> {
  const tenant = await getTenantById(input.tenantId);
  const settings = parseTenantOwnership(
    (tenant as { ownership?: unknown } | null)?.ownership,
  );

  if (settings.useFixedDefaultOwner && settings.defaultOwnerUserId) {
    const fixed = await getProfileById(settings.defaultOwnerUserId);
    if (
      fixed &&
      fixed.tenant_id === input.tenantId &&
      (!fixed.status || fixed.status === "active")
    ) {
      return {
        userId: fixed.id,
        userName: fixed.full_name || fixed.email || fixed.id,
        userEmail: fixed.email || "",
        source: "fixed",
      };
    }
  }

  const creator = await getProfileById(input.actorUserId);
  if (
    creator &&
    creator.tenant_id === input.tenantId &&
    (!creator.status || creator.status === "active" || creator.status === "invited")
  ) {
    return {
      userId: creator.id,
      userName: creator.full_name || creator.email || creator.id,
      userEmail: creator.email || "",
      source: "creator",
    };
  }

  // Profile missing (edge case) — still assign actor by id so the record has an owner.
  if (input.actorUserId) {
    return {
      userId: input.actorUserId,
      userName: input.actorUserId,
      userEmail: "",
      source: "creator",
    };
  }

  return null;
}

/**
 * Assign default owner after a record is created.
 * Never throws — ownership must not block record creation.
 */
export async function assignDefaultOwnerOnCreate(input: {
  tenantId: string;
  objectType: AssignableObjectType;
  objectId: string;
  actorUserId: string;
  actorEmail?: string | null;
  role?: AssignmentRole;
}): Promise<void> {
  const objectId = String(input.objectId || "").trim();
  const actorUserId = String(input.actorUserId || "").trim();
  if (!input.tenantId || !objectId || !actorUserId) return;

  try {
    const owner = await resolveDefaultOwnerUser({
      tenantId: input.tenantId,
      actorUserId,
    });
    if (!owner) return;

    const actorEmail =
      (input.actorEmail && String(input.actorEmail).trim()) ||
      owner.userEmail ||
      actorUserId;

    await assignUserToObject({
      tenantId: input.tenantId,
      objectType: input.objectType,
      objectId,
      userId: owner.userId,
      userName: owner.userName,
      userEmail: owner.userEmail,
      role: input.role || defaultAssignmentRole(input.objectType),
      actorUserId,
      actorEmail,
    });
  } catch (error) {
    console.error(
      `[assignDefaultOwnerOnCreate] ${input.objectType}/${objectId}:`,
      error,
    );
  }
}
