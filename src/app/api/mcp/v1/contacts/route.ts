import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import {
  addContactToClient,
  getAllClients,
  getClientById,
} from "@/lib/db/repositories/client-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;
  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(
      50,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "25", 10) || 25)
    );
    const companies = await getAllClients(gate.auth.tenantId);
    const rows: any[] = [];
    for (const company of companies || []) {
      for (const c of company.contacts || []) {
        if (!c?.name && !c?.id) continue;
        const row = {
          id: c.id,
          name: c.name,
          title: c.title || null,
          email: c.email || null,
          isPrimary: !!c.isPrimary,
          companyId: company.id,
          companyName: company.name || null,
        };
        if (!q) {
          rows.push(row);
          continue;
        }
        const hay = [row.name, row.title, row.email, row.companyName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (hay.includes(q)) rows.push(row);
      }
    }
    return NextResponse.json({
      tenantId: gate.auth.tenantId,
      count: rows.length,
      contacts: rows.slice(0, limit),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to list contacts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || body.contact_name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    let company = body.companyId
      ? await getClientById(gate.auth.tenantId, String(body.companyId))
      : null;
    if (!company && body.companyName) {
      const needle = String(body.companyName).toLowerCase().replace(/[^a-z0-9]/g, "");
      const all = await getAllClients(gate.auth.tenantId);
      company =
        all.find((c: any) => {
          const n = String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return n === needle || n.includes(needle);
        }) || null;
    }
    if (!company?.id) {
      return NextResponse.json(
        { error: "Company not found. Create it first with create_company." },
        { status: 404 }
      );
    }
    const actor = {
      userId: gate.auth.userId || gate.auth.keyId || "mcp",
      email: `mcp:${gate.auth.keyName || "key"}`,
    };
    const updated = await addContactToClient(
      gate.auth.tenantId,
      String(company.id),
      {
        name,
        title: String(body.title || body.contact_title || "").trim(),
        email: String(body.email || body.contact_email || "").trim(),
        phone: String(body.phone || body.contact_phone || "").trim(),
        isPrimary: body.isPrimary !== false,
      },
      actor
    );
    const contact = (updated.contacts || []).find(
      (c: any) => String(c.name || "").toLowerCase() === name.toLowerCase()
    );
    return NextResponse.json({
      success: true,
      tenantId: gate.auth.tenantId,
      company: { id: company.id, name: company.name },
      contact: contact
        ? { id: contact.id, name: contact.name, title: contact.title }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create contact" },
      { status: 500 }
    );
  }
}
