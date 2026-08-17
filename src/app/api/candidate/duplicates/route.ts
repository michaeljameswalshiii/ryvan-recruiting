/**
 * POST /api/candidate/duplicates
 * Body: incoming candidate fields (name, email, phone, experience, education…)
 * Returns possible ATS matches with comparison copy for the add-candidate modal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId } from "@/lib/server-auth";
import { getAllLeads } from "@/lib/db/repositories/lead-repository";
import { findDuplicateMatches } from "@/lib/candidates/duplicates";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const incoming = {
      name: String(body.name || ""),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      title: String(body.title || ""),
      location: String(body.location || ""),
      linkedin_url: String(body.linkedin_url || ""),
      resume_file_name: String(body.resume_file_name || ""),
      source: String(body.source || ""),
      experience: Array.isArray(body.experience) ? body.experience : [],
      education: Array.isArray(body.education) ? body.education : [],
    };

    const leads = await getAllLeads(tenantId);
    const matches = findDuplicateMatches(incoming, leads as any[]);

    return NextResponse.json({
      matches,
      count: matches.length,
    });
  } catch (err: any) {
    console.error("[POST /api/candidate/duplicates]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to check for duplicates" },
      { status: 500 }
    );
  }
}
