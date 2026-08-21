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
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://ryvan-recruiting.vercel.app");
    return NextResponse.json({
      keys,
      tenantId,
      appUrl,
      mcpUrl: `${appUrl.replace(/\/$/, "")}/api/mcp`,
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
        : "https://ryvan-recruiting.vercel.app");

    const mcpUrl = `${appUrl.replace(/\/$/, "")}/api/mcp`;

    // Preferred: fully remote Streamable HTTP (no local install)
    const claudeRemoteConfig = {
      mcpServers: {
        "trio-recruiting": {
          type: "http",
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${plaintext}`,
            "X-Trio-Tenant-Id": tenantId,
          },
        },
      },
    };

    // Claude Code CLI one-liner
    const claudeCodeCli = [
      "claude mcp add --transport http trio-recruiting",
      mcpUrl,
      `--header "Authorization: Bearer ${plaintext}"`,
      `--header "X-Trio-Tenant-Id: ${tenantId}"`,
    ].join(" ");

    // Legacy: local stdio bridge (only if you need older Desktop without remote MCP)
    const claudeDesktopLocalConfig = {
      mcpServers: {
        "trio-recruiting": {
          command: "npx",
          args: [
            "tsx",
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
      mcpUrl,
      claudeRemoteConfig,
      claudeCodeCli,
      /** @deprecated prefer claudeRemoteConfig */
      claudeDesktopConfig: claudeRemoteConfig,
      claudeDesktopLocalConfig,
      message:
        "Copy the API key now. Connect Claude with the remote URL — no local install required.",
    });
  } catch (e: any) {
    console.error("[POST /api/tenant/mcp-keys]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to create key" },
      { status: 500 }
    );
  }
}
