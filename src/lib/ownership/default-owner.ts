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
import {
  getProfileByEmail,
  getProfileById,
  getProfilesByTenant,
} from "@/lib/db/repositories/profile-repository";
import { isMachineActorId } from "@/lib/ownership/machine-actor";
import { normalizeRole } from "@/lib/roles";

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
function profileAsOwner(
  profile: {
    id?: string;
    full_name?: string;
    email?: string;
    tenant_id?: string;
    status?: string;
  } | null,
  tenantId: string,
  source: "fixed" | "creator",
) {
  if (!profile?.id) return null;
  if (profile.tenant_id && profile.tenant_id !== tenantId) return null;
  if (profile.status && profile.status !== "active" && profile.status !== "invited") {
    return null;
  }
  const name = String(profile.full_name || profile.email || "").trim();
  if (!name || isMachineActorId(name) || isMachineActorId(profile.id)) return null;
  return {
    userId: profile.id,
    userName: name,
    userEmail: profile.email || "",
    source,
  };
}

async function firstTeammateOwner(tenantId: string) {
  const profiles = await getProfilesByTenant(tenantId);
  const usable = (profiles || []).filter(
    (p) =>
      p?.id &&
      (!p.status || p.status === "active") &&
      !isMachineActorId(p.id) &&
      !isMachineActorId(p.full_name || p.email),
  );
  usable.sort((a, b) => {
    const rank = (role?: string) => {
      const r = normalizeRole(role || "user");
      if (r === "company_admin") return 0;
      if (r === "site_admin") return 1;
      return 2;
    };
    return rank(a.role) - rank(b.role);
  });
  return profileAsOwner(usable[0] || null, tenantId, "fixed");
}

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
    const asOwner = profileAsOwner(fixed, input.tenantId, "fixed");
    if (asOwner) return asOwner;
  }

  const actorId = String(input.actorUserId || "").trim();
  if (actorId && !isMachineActorId(actorId)) {
    const creator = actorId.includes("@")
      ? await getProfileByEmail(actorId)
      : await getProfileById(actorId);
    const asOwner = profileAsOwner(creator, input.tenantId, "creator");
    if (asOwner) return asOwner;
  }

  return firstTeammateOwner(input.tenantId);
}

/**
 * Assign default owner after a record is created.
 * Never throws — ownership must not block record creation.
 */
export async function assignDefaultOwnerOnCreate(input: {
  tenantId: string;
  objectType: AssignableObjectType;
  objectId: string;
  actorUserId?: string;
  actorEmail?: string | null;
  role?: AssignmentRole;
  /** When set, this teammate is assigned instead of the tenant default / creator. */
  overrideUserId?: string;
}): Promise<{
  userId: string;
  userName: string;
  userEmail: string;
  source: "fixed" | "creator";
} | null> {
  const objectId = String(input.objectId || "").trim();
  const actorUserId = String(input.actorUserId || "").trim();
  if (!input.tenantId || !objectId) return null;

  try {
    const overrideId = String(input.overrideUserId || "").trim();
    let owner: {
      userId: string;
      userName: string;
      userEmail: string;
      source: "fixed" | "creator";
    } | null = null;

    if (overrideId) {
      const profile = await getProfileById(overrideId);
      if (
        profile &&
        profile.tenant_id === input.tenantId &&
        (!profile.status || profile.status === "active")
      ) {
        owner = {
          userId: profile.id,
          userName: profile.full_name || profile.email || profile.id,
          userEmail: profile.email || "",
          source: "fixed",
        };
      }
    }

    if (!owner) {
      owner = await resolveDefaultOwnerUser({
        tenantId: input.tenantId,
        actorUserId,
      });
    }
    if (!owner) return null;

    const actorEmail =
      (input.actorEmail && String(input.actorEmail).trim()) ||
      owner.userEmail ||
      actorUserId ||
      "system";

    await assignUserToObject({
      tenantId: input.tenantId,
      objectType: input.objectType,
      objectId,
      userId: owner.userId,
      userName: owner.userName,
      userEmail: owner.userEmail,
      role: input.role || defaultAssignmentRole(input.objectType),
      actorUserId: actorUserId || "system",
      actorEmail,
    });
    if (input.objectType === "company") {
      try {
        const { updateClient } = await import(
          "@/lib/db/repositories/client-repository"
        );
        await updateClient(input.tenantId, objectId, {
          ownerName: owner.userName,
          ownerUserId: owner.userId,
          accountOwner: owner.userName,
        });
      } catch (stampErr) {
        console.warn("[assignDefaultOwnerOnCreate] stamp company owner", stampErr);
      }
    }
    return owner;
  } catch (error) {
    console.error(
      `[assignDefaultOwnerOnCreate] ${input.objectType}/${objectId}:`,
      error,
    );
    return null;
  }
}
