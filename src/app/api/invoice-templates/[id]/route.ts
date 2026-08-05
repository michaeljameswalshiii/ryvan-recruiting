/**
 * PATCH/DELETE /api/invoice-templates/[id]
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
import { updateInvoiceTemplateSchema } from "@/lib/schemas/invoice";
import {
  updateInvoiceTemplate,
  deleteInvoiceTemplate,
  getInvoiceTemplate,
} from "@/lib/db/repositories/invoice-repository";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const body = await request.json();
    const parsed = updateInvoiceTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const template = await updateInvoiceTemplate(tenantId, id, parsed.data);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (e) {
    console.error("[invoice-templates PATCH]", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const existing = await getInvoiceTemplate(tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await deleteInvoiceTemplate(tenantId, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[invoice-templates DELETE]", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
