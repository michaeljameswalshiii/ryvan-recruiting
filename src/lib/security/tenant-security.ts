/**
 * Per-tenant security policy (MFA / SSO).
 * Defaults are off so existing orgs see no behavior change until an admin enables.
 */

export type MfaPolicy = "off" | "optional" | "admins" | "all";

export type TenantSecuritySettings = {
  /** MFA enforcement level — default off */
  mfaPolicy: MfaPolicy;
  /** When true, show SSO login option (IdP must be configured in Cognito) */
  ssoEnabled: boolean;
  /** Human label e.g. "Okta" / "Azure AD" */
  ssoProviderName?: string;
  /** Optional Cognito IdP name for Hosted UI */
  ssoCognitoIdpName?: string;
  /** Admin notes / setup status */
  ssoNotes?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_TENANT_SECURITY: TenantSecuritySettings = {
  mfaPolicy: "off",
  ssoEnabled: false,
};

export function normalizeMfaPolicy(raw: unknown): MfaPolicy {
  const v = String(raw || "off").toLowerCase();
  if (v === "optional" || v === "admins" || v === "all" || v === "off") {
    return v;
  }
  return "off";
}

export function parseTenantSecurity(raw: unknown): TenantSecuritySettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TENANT_SECURITY };
  }
  const o = raw as Record<string, unknown>;
  return {
    mfaPolicy: normalizeMfaPolicy(o.mfaPolicy),
    ssoEnabled: o.ssoEnabled === true,
    ssoProviderName:
      typeof o.ssoProviderName === "string" ? o.ssoProviderName : undefined,
    ssoCognitoIdpName:
      typeof o.ssoCognitoIdpName === "string" ? o.ssoCognitoIdpName : undefined,
    ssoNotes: typeof o.ssoNotes === "string" ? o.ssoNotes : undefined,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    updatedBy: typeof o.updatedBy === "string" ? o.updatedBy : undefined,
  };
}

/** Whether this role must complete MFA under the policy (when Cognito MFA is configured). */
export function roleRequiresMfa(
  policy: MfaPolicy,
  role: string | undefined
): boolean {
  if (policy === "off" || policy === "optional") return false;
  if (policy === "all") return true;
  // admins
  const r = (role || "").toLowerCase();
  return (
    r === "site_admin" ||
    r === "company_admin" ||
    r === "admin" ||
    r === "customer_admin"
  );
}
