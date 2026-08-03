/**
 * GET/PATCH /api/tenant/security
 * Tenant MFA/SSO policy. Defaults keep all orgs on mfaPolicy=off, ssoEnabled=false.
 * company_admin+ can read/update.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  requireTeamAdmin,
  isAuthError,
} from "@/lib/tenant-guard";
import {
  getTenantById,
  updateTenant,
} from "@/lib/db/repositories/tenant-repository";
import {
  DEFAULT_TENANT_SECURITY,
  normalizeMfaPolicy,
  parseTenantSecurity,
  type MfaPolicy,
} from "@/lib/security/tenant-security";
import {
  writeSecurityAudit,
  requestAuditMeta,
} from "@/lib/security/audit";

export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const security = parseTenantSecurity(tenant.security);
    return NextResponse.json({
      security,
      defaults: DEFAULT_TENANT_SECURITY,
      /** Cognito Hosted UI domain if configured (for SSO start later) */
      cognitoHostedUiDomain: process.env.COGNITO_HOSTED_UI_DOMAIN || null,
      cognitoClientId:
        process.env.COGNITO_CLIENT_ID ||
        process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ||
        null,
    });
  } catch (e) {
    console.error("[GET /api/tenant/security]", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const body = await request.json();
    const current = await getTenantById(tenantId);
    if (!current) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const prev = parseTenantSecurity(current.security);
    const mfaPolicy: MfaPolicy = body.mfaPolicy
      ? normalizeMfaPolicy(body.mfaPolicy)
      : prev.mfaPolicy;

    const next = {
      mfaPolicy,
      ssoEnabled:
        typeof body.ssoEnabled === "boolean"
          ? body.ssoEnabled
          : prev.ssoEnabled,
      ssoProviderName:
        body.ssoProviderName !== undefined
          ? String(body.ssoProviderName || "").slice(0, 80) || undefined
          : prev.ssoProviderName,
      ssoCognitoIdpName:
        body.ssoCognitoIdpName !== undefined
          ? String(body.ssoCognitoIdpName || "").slice(0, 80) || undefined
          : prev.ssoCognitoIdpName,
      ssoNotes:
        body.ssoNotes !== undefined
          ? String(body.ssoNotes || "").slice(0, 500) || undefined
          : prev.ssoNotes,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.email || auth.userId,
    };

    await updateTenant(tenantId, { security: next });

    void writeSecurityAudit({
      tenantId,
      action: "admin.security.settings_updated",
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      summary: `Security settings updated (mfa=${next.mfaPolicy}, sso=${next.ssoEnabled})`,
      meta: { mfaPolicy: next.mfaPolicy, ssoEnabled: next.ssoEnabled },
      ...requestAuditMeta(request),
    });

    return NextResponse.json({ success: true, security: next });
  } catch (e) {
    console.error("[PATCH /api/tenant/security]", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
