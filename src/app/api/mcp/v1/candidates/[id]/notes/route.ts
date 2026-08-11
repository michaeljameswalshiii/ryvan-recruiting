/**
 * MCP HTTP: POST /api/mcp/v1/candidates/[id]/notes
 * Body: { noteText, noteType? }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { addNoteToCandidate } from "@/lib/events/candidate-events";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const noteText = String(body.noteText || body.text || "").trim();
    const noteType = String(body.noteType || "Note").trim() || "Note";

    if (!noteText) {
      return NextResponse.json(
        { error: "noteText is required" },
        { status: 400 }
      );
    }

    const lead = await getLeadById(gate.auth.tenantId, id);
    if (!lead) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const result = await addNoteToCandidate(
      id,
      noteText,
      `mcp:${gate.auth.keyName}`,
      { noteType, via: "mcp-http", tenantId: gate.auth.tenantId }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to add note" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      candidateId: id,
      candidateName: (lead as any).name || null,
      eventId: result.eventId,
      message: "Note recorded on candidate activity log",
    });
  } catch (e: any) {
    console.error("[mcp/v1/candidates/id/notes]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to add note" },
      { status: 500 }
    );
  }
}
