/**
 * GET/POST /api/invoice-templates — company_admin+
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
import { createInvoiceTemplateSchema } from "@/lib/schemas/invoice";
import {
  listInvoiceTemplates,
  createInvoiceTemplate,
} from "@/lib/db/repositories/invoice-repository";
import { getTenantById } from "@/lib/db/repositories/tenant-repository";

export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const templates = await listInvoiceTemplates(tenantId);
    const tenant = await getTenantById(tenantId);
    return NextResponse.json({
      templates,
      org_logo_url: tenant?.logo_url || null,
      org_name: tenant?.name || null,
      org_primary_color: tenant?.primary_color || "#2563eb",
    });
  } catch (e) {
    console.error("[invoice-templates GET]", e);
    return NextResponse.json({ error: "Failed to list templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const body = await request.json();
    const parsed = createInvoiceTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tenant = await getTenantById(tenantId);
    const input = {
      ...parsed.data,
      from_name: parsed.data.from_name || tenant?.name || "",
      primary_color:
        parsed.data.primary_color || tenant?.primary_color || "#2563eb",
      // default logo empty → runtime uses org logo
      logo_url: parsed.data.logo_url ?? null,
    };

    const template = await createInvoiceTemplate(tenantId, input);
    return NextResponse.json({ template }, { status: 201 });
  } catch (e) {
    console.error("[invoice-templates POST]", e);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
