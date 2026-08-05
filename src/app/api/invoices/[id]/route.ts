/**
 * GET/PATCH /api/invoices/[id]
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
import { updateInvoiceSchema } from "@/lib/schemas/invoice";
import {
  getInvoice,
  updateInvoice,
} from "@/lib/db/repositories/invoice-repository";

export async function GET(
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

    const invoice = await getInvoice(tenantId, id);
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (e) {
    console.error("[invoices GET id]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

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
    const parsed = updateInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const invoice = await updateInvoice(tenantId, id, parsed.data);
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (e) {
    console.error("[invoices PATCH]", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
