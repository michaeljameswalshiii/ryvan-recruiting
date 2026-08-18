/**
 * POST /api/invoice-templates/file — upload Word/PDF invoice template
 * GET  /api/invoice-templates/file?url= — verify a Google Doc can be exported
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
import { uploadInvoiceTemplateFile } from "@/lib/invoices/source-file";
import {
  exportGoogleDocDocx,
  parseGoogleDocId,
} from "@/lib/invoices/merge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a Word or PDF file" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadInvoiceTemplateFile({
      tenantId,
      buffer,
      fileName: file.name || "template",
      contentType: file.type || "",
    });
    return NextResponse.json({ file: uploaded }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("[invoice-templates file]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;
    void tenantId;

    const url = request.nextUrl.searchParams.get("url") || "";
    if (!parseGoogleDocId(url)) {
      return NextResponse.json(
        { error: "Paste a Google Doc or Drive link" },
        { status: 400 }
      );
    }
    const buf = await exportGoogleDocDocx(url);
    return NextResponse.json({
      ok: true,
      bytes: buf.length,
      message:
        "Google Doc is readable. Trio will fill {{merge}} fields when you create an invoice.",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not open that Google Doc";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
