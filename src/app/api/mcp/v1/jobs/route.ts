/**
 * MCP HTTP: GET /api/mcp/v1/jobs?status=&limit=
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMcpHttpAuth } from "@/lib/mcp/http-auth";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { normalizeJobStatus } from "@/lib/jobs/status";

export async function GET(request: NextRequest) {
  const gate = await requireMcpHttpAuth(request);
  if (!gate.ok) return gate.response;

  try {
    const statusFilter = (request.nextUrl.searchParams.get("status") || "").trim();
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "50", 10) || 50)
    );

    let jobs = await getAllJobs(gate.auth.tenantId);
    if (statusFilter) {
      const want = normalizeJobStatus(statusFilter);
      jobs = jobs.filter(
        (j: any) => normalizeJobStatus(j.status) === want
      );
    }

    const rows = jobs.slice(0, limit).map((j: any) => ({
      id: j.id,
      title: j.title || null,
      status: j.status || null,
      companyName: j.companyName || null,
      location: j.location || null,
      employmentType: j.employmentType || null,
      candidateCount: Array.isArray(j.candidates) ? j.candidates.length : 0,
      createdAt: j.created_at || null,
    }));

    return NextResponse.json({
      tenantId: gate.auth.tenantId,
      statusFilter: statusFilter || null,
      count: rows.length,
      jobs: rows,
    });
  } catch (e: any) {
    console.error("[mcp/v1/jobs]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list jobs" },
      { status: 500 }
    );
  }
}
