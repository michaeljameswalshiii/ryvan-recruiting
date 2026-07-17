/**
 * Admin: list / create MCP API keys for Claude connections
 * GET  /api/tenant/mcp-keys
 * POST /api/tenant/mcp-keys  { name?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import { hasPermission } from "@/lib/roles";
import {
  createMcpApiKey,
  listMcpApiKeys,
} from "@/lib/mcp/api-keys";

export async function GET() {
  try {
    const session = await getSession();
    const tenantId = await getSessionTenantId();
    if (!session?.userId || !tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.role, "team_admin")) {
      return NextResponse.json(
        { error: "Only organization admins can manage MCP API keys" },
        { status: 403 }
      );
    }

    const keys = await listMcpApiKeys(tenantId);
    return NextResponse.json({
      keys,
      tenantId,
      appUrl:
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://turnkey-optimization.vercel.app"),
    });
  } catch (e: any) {
    console.error("[GET /api/tenant/mcp-keys]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantId = await getSessionTenantId();
    if (!session?.userId || !tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.role, "team_admin")) {
      return NextResponse.json(
        { error: "Only organization admins can create MCP API keys" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "Claude MCP").slice(0, 80);
    const createdBy = session.email || session.userId;

    const { key, plaintext } = await createMcpApiKey({
      tenantId,
      name,
      createdBy,
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://turnkey-optimization.vercel.app");

    // Ready-to-paste Claude Desktop snippet
    const claudeDesktopConfig = {
      mcpServers: {
        "trio-recruiting": {
          command: "npx",
          args: [
            "tsx",
            // User replaces with local path after git clone
            "<PATH_TO_REPO>/mcp-server/src/index.ts",
          ],
          env: {
            TRIO_APP_URL: appUrl,
            TRIO_MCP_API_KEY: plaintext,
            TRIO_TENANT_ID: tenantId,
            TRIO_MCP_MODE: "http",
          },
        },
      },
    };

    return NextResponse.json({
      success: true,
      key,
      /** Shown once — store securely */
      plaintext,
      tenantId,
      appUrl,
      claudeDesktopConfig,
      message:
        "Copy the API key now. It will not be shown again. Use it with TRIO_APP_URL and TRIO_TENANT_ID in Claude.",
    });
  } catch (e: any) {
    console.error("[POST /api/tenant/mcp-keys]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to create key" },
      { status: 500 }
    );
  }
}
