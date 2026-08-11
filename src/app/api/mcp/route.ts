/**
 * Remote MCP Streamable HTTP endpoint (no local install).
 *
 * POST/GET/DELETE  /api/mcp
 * Auth: Authorization: Bearer <trio_mcp_...>  (required by middleware)
 *       X-Trio-Tenant-Id optional — resolved from key when omitted
 *
 * Tools: list/get candidates & jobs, pipeline, activity;
 *        create/update candidate, stage, note, link to job
 *
 * Stateless + JSON responses — safe on Vercel serverless.
 *
 * Claude.ai connector: URL https://YOUR_APP/api/mcp
 *   Authorization: Bearer <key>
 *
 * Claude Code:
 *   claude mcp add --transport http trio-recruiting https://YOUR_APP/api/mcp \
 *     --header "Authorization: Bearer KEY"
 *
 * Dev: TRIO_MCP_TEST_KEY + TRIO_MCP_TEST_TENANT_ID
 */

import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import { createTrioMcpServer } from "@/lib/mcp/create-server";
import { mcpOptionsResponse, withMcpCors } from "@/lib/mcp/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleMcp(request: NextRequest): Promise<Response> {
  if (request.method === "OPTIONS") {
    return mcpOptionsResponse();
  }

  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) {
    return withMcpCors(gate.response);
  }

  const server = createTrioMcpServer(gate.auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: new server+transport per request (Vercel-safe)
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withMcpCors(response);
  } catch (err) {
    console.error("[api/mcp]", err);
    return withMcpCors(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message:
              err instanceof Error ? err.message : "Internal MCP server error",
          },
          id: null,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  } finally {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    try {
      await server.close();
    } catch {
      /* ignore */
    }
  }
}

export async function POST(request: NextRequest) {
  return handleMcp(request);
}

export async function GET(request: NextRequest) {
  return handleMcp(request);
}

export async function DELETE(request: NextRequest) {
  return handleMcp(request);
}

export async function OPTIONS() {
  return mcpOptionsResponse();
}
