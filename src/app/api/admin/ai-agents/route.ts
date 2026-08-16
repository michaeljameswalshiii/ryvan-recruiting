import { NextRequest, NextResponse } from "next/server";
import { requireSiteAdminSession, isAdminAuthError } from "@/lib/admin-auth";
import {
  setAgentScheduleEnabled,
  PLATFORM_AGENTS,
  type PlatformAgentId,
} from "@/lib/agents/platform-control";
import { listManagedAgentsWithState } from "@/lib/agents/agent-state";
import { getOpsFixOverview } from "@/lib/agents/error-fixer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const IDS = new Set(PLATFORM_AGENTS.map((agent) => agent.id));

export async function GET() {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;
  const [agents, opsFixes] = await Promise.all([
    listManagedAgentsWithState(),
    getOpsFixOverview().catch(() => null),
  ]);
  const spendToday = agents.reduce((sum, agent) => sum + agent.cost.spentTodayUsd, 0);
  const spendMonth = agents.reduce((sum, agent) => sum + agent.cost.spentMonthUsd, 0);
  const projectedDay = agents
    .filter((agent) => agent.kind === "cron")
    .reduce((sum, agent) => sum + agent.cost.estimateDayIfOnUsd, 0);
  return NextResponse.json({
    agents,
    opsFixes,
    totals: {
      spendTodayUsd: Math.round(spendToday * 100) / 100,
      spendMonthUsd: Math.round(spendMonth * 100) / 100,
      projectedDayIfEnabledUsd: Math.round(projectedDay * 100) / 100,
    },
    note: "Schedules stay off until you enable them. System ops can open and merge GitHub PRs for new errors. Idle ticks cost $0.",
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "") as PlatformAgentId;
  const meta = PLATFORM_AGENTS.find((agent) => agent.id === id);
  if (!IDS.has(id) || meta?.kind !== "cron") {
    return NextResponse.json({ error: "Unknown scheduled agent" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  await setAgentScheduleEnabled(id, body.enabled, auth.email || auth.userId);
  const agents = await listManagedAgentsWithState();
  return NextResponse.json({ ok: true, agents });
}
