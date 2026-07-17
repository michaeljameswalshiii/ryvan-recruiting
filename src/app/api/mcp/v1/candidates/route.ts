/**
 * MCP HTTP: GET /api/mcp/v1/candidates?q=&limit=
 * Auth: Bearer API key + X-Trio-Tenant-Id
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import { getAllLeads } from "@/lib/db/repositories/lead-repository";

export async function GET(request: NextRequest) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;

  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(
      50,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20)
    );

    const leads = await getAllLeads(gate.auth.tenantId);
    let rows = leads;
    if (q) {
      rows = leads.filter((l: any) => {
        const hay = [
          l.name,
          l.email,
          l.phone,
          l.title,
          l.status,
          l.source,
          l.location,
          l.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const candidates = rows.slice(0, limit).map((l: any) => ({
      id: l.id,
      name: l.name || null,
      email: l.email || null,
      phone: l.phone || null,
      title: l.title || null,
      status: l.status || null,
      source: l.source || null,
      location: l.location || null,
      linkedJobCount: Array.isArray(l.linkedJobs) ? l.linkedJobs.length : 0,
      createdAt: l.created_at || null,
    }));

    return NextResponse.json({
      tenantId: gate.auth.tenantId,
      query: q || null,
      count: candidates.length,
      candidates,
    });
  } catch (e: any) {
    console.error("[mcp/v1/candidates]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to search candidates" },
      { status: 500 }
    );
  }
}
