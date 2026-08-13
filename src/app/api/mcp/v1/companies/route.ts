import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import {
  addContactToClient,
  createClient,
  getAllClients,
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
    const all = await getAllClients(gate.auth.tenantId);
    const rows = (all || []).filter((c: any) => {
      if (!q) return true;
      const hay = [c.name, c.companyName, c.domain, c.industry, c.city, c.state]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return NextResponse.json({
      tenantId: gate.auth.tenantId,
      count: rows.length,
      companies: rows.slice(0, limit).map((c: any) => ({
        id: c.id,
        name: c.name || c.companyName || null,
        domain: c.domain || null,
        city: c.city || null,
        state: c.state || null,
        contactCount: Array.isArray(c.contacts) ? c.contacts.length : 0,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to list companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || body.company_name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const actor = {
      userId: gate.auth.keyId || "mcp",
      email: `mcp:${gate.auth.keyName || "key"}`,
    };
    const company = await createClient(
      gate.auth.tenantId,
      {
        name,
        domain: String(body.domain || "").trim() || undefined,
        industry: String(body.industry || "").trim() || undefined,
        city: String(body.city || "").trim() || undefined,
        state: String(body.state || "").trim() || undefined,
        status: "identification",
      },
      actor
    );

    let contact = null;
    if (body.with_primary_contact || body.contact_name) {
      const contactName = String(body.contact_name || "").trim();
      if (!contactName) {
        return NextResponse.json(
          { error: "contact_name is required when creating a primary contact" },
          { status: 400 }
        );
      }
      const updated = await addContactToClient(
        gate.auth.tenantId,
        String(company.id),
        {
          name: contactName,
          title: String(body.contact_title || "").trim(),
          email: String(body.contact_email || "").trim(),
          phone: String(body.contact_phone || "").trim(),
          isPrimary: true,
        },
        actor
      );
      contact = (updated.contacts || []).find(
        (c: any) => String(c.name || "").toLowerCase() === contactName.toLowerCase()
      );
    }

    return NextResponse.json({
      success: true,
      tenantId: gate.auth.tenantId,
      company: { id: company.id, name: company.name, domain: company.domain },
      contact: contact
        ? { id: contact.id, name: contact.name, title: contact.title }
        : null,
      urls: {
        company: `/dashboard/companies/${company.id}`,
        contact: contact?.id
          ? `/dashboard/contact-info/${contact.id}?companyId=${company.id}`
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create company" },
      { status: 500 }
    );
  }
}
