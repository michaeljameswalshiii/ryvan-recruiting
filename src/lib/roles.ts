/**
 * Role-based access control (RBAC)
 *
 * Roles:
 * - site_admin      Platform operator — all screens + multi-tenant tools
 * - customer_admin  Tenant admin — elevated screens within their tenant only
 * - user            Standard recruiter — core ATS screens
 *
 * Legacy values (admin / member / viewer) are normalized on read.
 */

export const ROLES = {
  SITE_ADMIN: "site_admin",
  CUSTOMER_ADMIN: "customer_admin",
  USER: "user",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<AppRole, string> = {
  site_admin: "Site Admin",
  customer_admin: "Customer Admin",
  user: "User",
};

/** Permission keys used for nav + page gates */
export type Permission =
  | "core_ats"
  | "settings"
  | "ai_apollo"
  | "issues"
  | "usage"
  | "team_admin"
  | "dynamo_search"
  | "multi_tenant"
  | "site_admin_tools";

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  user: ["core_ats", "settings"],
  customer_admin: [
    "core_ats",
    "settings",
    "ai_apollo",
    "issues",
    "usage",
    "team_admin",
  ],
  site_admin: [
    "core_ats",
    "settings",
    "ai_apollo",
    "issues",
    "usage",
    "team_admin",
    "dynamo_search",
    "multi_tenant",
    "site_admin_tools",
  ],
};

/**
 * Normalize any stored role string to a canonical AppRole.
 * Unknown / missing → user (least privilege).
 */
export function normalizeRole(raw: string | null | undefined): AppRole {
  const r = (raw || "").trim().toLowerCase();

  if (r === ROLES.SITE_ADMIN || r === "siteadmin" || r === "super_admin" || r === "superadmin") {
    return ROLES.SITE_ADMIN;
  }

  // Legacy "admin" = tenant admin (customer_admin), not platform site admin
  if (
    r === ROLES.CUSTOMER_ADMIN ||
    r === "admin" ||
    r === "customeradmin" ||
    r === "tenant_admin" ||
    r === "tenantadmin"
  ) {
    return ROLES.CUSTOMER_ADMIN;
  }

  if (r === ROLES.USER || r === "member" || r === "viewer" || r === "recruiter") {
    return ROLES.USER;
  }

  return ROLES.USER;
}

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[normalizeRole(role)];
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission
): boolean {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized].includes(permission);
}

export function isSiteAdmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === ROLES.SITE_ADMIN;
}

export function isCustomerAdmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === ROLES.CUSTOMER_ADMIN;
}

/** Customer Admin or Site Admin */
export function isTenantAdminOrAbove(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === ROLES.CUSTOMER_ADMIN || n === ROLES.SITE_ADMIN;
}

export function canAccessPath(
  role: string | null | undefined,
  pathname: string
): boolean {
  const path = pathname.split("?")[0] || pathname;

  // Site-only multi-tenant tools
  if (
    path.startsWith("/dashboard/dynamo-search") ||
    path.startsWith("/admin/dynamodb") ||
    path.startsWith("/dashboard/debug-env")
  ) {
    return hasPermission(role, "dynamo_search");
  }

  if (path.startsWith("/dashboard/ai-apollo")) {
    return hasPermission(role, "ai_apollo");
  }
  if (path.startsWith("/dashboard/issues")) {
    return hasPermission(role, "issues");
  }
  if (path.startsWith("/dashboard/usage")) {
    return hasPermission(role, "usage");
  }
  if (path.startsWith("/dashboard/settings")) {
    return hasPermission(role, "settings");
  }
  if (path.startsWith("/dashboard/site-admin")) {
    return hasPermission(role, "site_admin_tools");
  }

  // Core ATS + anything else under /dashboard for authenticated users
  return hasPermission(role, "core_ats");
}

/** Valid roles for assignment (e.g. team management UI) */
export const ASSIGNABLE_ROLES: AppRole[] = [
  ROLES.USER,
  ROLES.CUSTOMER_ADMIN,
  ROLES.SITE_ADMIN,
];

/** Roles a customer admin may assign within their tenant (not site_admin) */
export const TENANT_ASSIGNABLE_ROLES: AppRole[] = [
  ROLES.USER,
  ROLES.CUSTOMER_ADMIN,
];
