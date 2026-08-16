import { NextRequest, NextResponse } from "next/server";
import { requireSiteAdminSession, isAdminAuthError } from "@/lib/admin-auth";
import { PLATFORM_AGENTS, type PlatformAgentId } from "@/lib/agents/platform-control";
import { runSystemTask, type SystemTaskId } from "@/lib/agents/system-tasks";
import { recordCronHeartbeat } from "@/lib/observability/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const IDS = new Set(PLATFORM_AGENTS.map((agent) => agent.id));
const TASKS = new Set<SystemTaskId>([
  "clean-errors",
  "prune-samples",
  "health-digest",
  "fix-errors",
]);

function appOrigin(request: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "") as PlatformAgentId;
  const meta = PLATFORM_AGENTS.find((agent) => agent.id === id);
  if (!meta || !IDS.has(id)) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  }

  if (meta.kind === "task") {
    const task = String(body.task || "health-digest") as SystemTaskId;
    if (!TASKS.has(task)) {
      return NextResponse.json({ error: "Unknown system task" }, { status: 400 });
    }
    const started = Date.now();
    const result = await runSystemTask(task);
    await recordCronHeartbeat({
      cronId: "system-ops",
      label: "System ops",
      schedule: "On demand",
      path: "/api/admin/ai-agents/run",
      status: result.ok ? "ok" : "error",
      durationMs: Date.now() - started,
      detail: result.detail,
    });
    return NextResponse.json(
      {
        ok: result.ok,
        elapsedMs: Date.now() - started,
        result,
      },
      { status: result.ok ? 200 : 502 }
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  const url = `${appOrigin(request)}${meta.path}?force=1`;
  const started = Date.now();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "x-cron-secret": secret,
    },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - started,
      result: payload,
    },
    { status: res.ok ? 200 : 502 }
  );
}
