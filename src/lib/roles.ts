/**
 * Role-based access control (RBAC)
 *
 * Roles:
 * - site_admin     Platform operator — all screens + multi-tenant tools
 * - company_admin  Company / tenant admin — elevated screens within their tenant
 * - user           Standard recruiter — core ATS screens
 *
 * Legacy values (admin, customer_admin, member, viewer) are normalized on read.
 */

export const ROLES = {
  SITE_ADMIN: "site_admin",
  COMPANY_ADMIN: "company_admin",
  USER: "user",
  /**
   * @deprecated Legacy alias — same permissions as COMPANY_ADMIN.
   * Kept so older call sites compile; prefer COMPANY_ADMIN.
   */
  CUSTOMER_ADMIN: "company_admin",
} as const;

export type AppRole = "site_admin" | "company_admin" | "user";

export const ROLE_LABELS: Record<AppRole, string> = {
  site_admin: "Site Admin",
  company_admin: "Company Admin",
  user: "User",
};

/** Short descriptions for invite UI / settings */
export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  site_admin: "Platform operator with multi-tenant tools",
  company_admin: "Manages team and company settings for this organization",
  user: "Standard recruiter access to core ATS features",
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
  // Company admin: core ATS + team/settings only — no lower-menu Admin screens
  // (AI Apollo, AI Reliability, Issues, Usage stay site_admin-only).
  company_admin: ["core_ats", "settings", "team_admin"],
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
  const r = (raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    r === ROLES.SITE_ADMIN ||
    r === "siteadmin" ||
    r === "super_admin" ||
    r === "superadmin"
  ) {
    return ROLES.SITE_ADMIN;
  }

  // Company admin (canonical) + legacy customer_admin / admin / tenant_admin
  if (
    r === ROLES.COMPANY_ADMIN ||
    r === "companyadmin" ||
    r === "company_admin" ||
    r === "customer_admin" ||
    r === "customeradmin" ||
    r === "admin" ||
    r === "tenant_admin" ||
    r === "tenantadmin"
  ) {
    return ROLES.COMPANY_ADMIN;
  }

  if (
    r === ROLES.USER ||
    r === "member" ||
    r === "viewer" ||
    r === "recruiter" ||
    r === "standard"
  ) {
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

/** True for company_admin (includes legacy customer_admin / admin) */
export function isCompanyAdmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === ROLES.COMPANY_ADMIN;
}

/** @deprecated Use isCompanyAdmin */
export function isCustomerAdmin(role: string | null | undefined): boolean {
  return isCompanyAdmin(role);
}

/** Company Admin or Site Admin */
export function isTenantAdminOrAbove(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === ROLES.COMPANY_ADMIN || n === ROLES.SITE_ADMIN;
}

export function canAccessPath(
  role: string | null | undefined,
  pathname: string
): boolean {
  const path = pathname.split("?")[0] || pathname;

  // Site-only multi-tenant tools
  if (
    path.startsWith("/dashboard/dynamo-search") ||
    path.startsWith("/admin/dynamodb")
  ) {
    return hasPermission(role, "dynamo_search");
  }

  if (path.startsWith("/dashboard/ai-apollo")) {
    return hasPermission(role, "ai_apollo");
  }
  if (path.startsWith("/dashboard/issues")) {
    return hasPermission(role, "issues");
  }
  if (
    path.startsWith("/dashboard/usage") ||
    path.startsWith("/dashboard/ai-reliability")
  ) {
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
  ROLES.COMPANY_ADMIN,
  ROLES.SITE_ADMIN,
];

/** Roles a company admin may assign within their tenant (not site_admin) */
export const TENANT_ASSIGNABLE_ROLES: AppRole[] = [
  ROLES.USER,
  ROLES.COMPANY_ADMIN,
];
