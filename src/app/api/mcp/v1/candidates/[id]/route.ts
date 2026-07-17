/**
 * MCP HTTP: GET /api/mcp/v1/candidates/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import { getLeadById } from "@/lib/db/repositories/lead-repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    const lead = await getLeadById(gate.auth.tenantId, id);
    if (!lead) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    const l = lead as any;
    return NextResponse.json({
      tenantId: gate.auth.tenantId,
      candidate: {
        id: l.id,
        name: l.name || null,
        email: l.email || null,
        phone: l.phone || null,
        title: l.title || null,
        status: l.status || null,
        source: l.source || null,
        location: l.location || null,
        notes: l.notes || null,
        summary: l.summary || null,
        skills: l.skills || null,
        linkedJobs: l.linkedJobs || [],
        createdAt: l.created_at || null,
        modifiedAt: l.modified_at || null,
      },
    });
  } catch (e: any) {
    console.error("[mcp/v1/candidates/id]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to get candidate" },
      { status: 500 }
    );
  }
}
