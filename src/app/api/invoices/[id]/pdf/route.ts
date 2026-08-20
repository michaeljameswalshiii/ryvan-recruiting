/**
 * GET /api/invoices/[id]/pdf — download PDF
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  isAuthError,
} from "@/lib/tenant-guard";
import { getInvoice } from "@/lib/db/repositories/invoice-repository";
import { renderInvoiceFile } from "@/lib/invoices/render";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const invoice = await getInvoice(tenantId, id);
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await renderInvoiceFile(invoice, tenantId);

    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to generate invoice file";
    console.error("[invoices pdf]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
