/**
 * DELETE /api/tenant/mcp-keys/[id] — revoke an MCP API key
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import { hasPermission } from "@/lib/roles";
import { revokeMcpApiKey } from "@/lib/mcp/api-keys";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const tenantId = await getSessionTenantId();
    if (!session?.userId || !tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.role, "team_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Key id required" }, { status: 400 });
    }

    const ok = await revokeMcpApiKey(tenantId, id);
    if (!ok) {
      return NextResponse.json(
        { error: "Key not found or already revoked" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/tenant/mcp-keys/id]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to revoke key" },
      { status: 500 }
    );
  }
}
