/**
 * GET /api/agent-ops/summary
 * Recruiter operational snapshot for the Agent Ops module.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server-auth";
import { buildAgentOpsSummary } from "@/lib/agent-ops/build-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.userId || !session.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await buildAgentOpsSummary({
      tenantId: session.tenantId,
      userId: session.userId,
      email: session.email,
    });
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("[agent-ops/summary]", error);
    return NextResponse.json(
      { error: "Could not load agent operations" },
      { status: 500 }
    );
  }
}
