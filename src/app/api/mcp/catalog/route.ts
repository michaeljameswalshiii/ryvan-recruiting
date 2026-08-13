/**
 * Authenticated catalog so we can confirm which MCP tools production is serving.
 * GET /api/mcp/catalog
 */
import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";

export const dynamic = "force-dynamic";

const TOOLS = [
  "trio_help",
  "list_companies",
  "get_company",
  "create_company",
  "list_contacts",
  "create_contact",
  "create_company_with_primary_contact",
  "list_candidates",
  "search_candidates",
  "get_candidate",
  "create_candidate",
  "update_candidate",
  "update_candidate_stage",
  "list_candidate_activity",
  "add_note",
  "link_candidate_to_job",
  "list_jobs",
  "get_job",
];

export async function GET(request: NextRequest) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;
  return NextResponse.json({
    version: "2.4.0",
    tenantId: gate.auth.tenantId,
    toolCount: TOOLS.length,
    tools: TOOLS,
  });
}
