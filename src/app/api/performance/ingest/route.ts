import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession } from "@/lib/admin-auth";
import { recordOpsEvents } from "@/lib/observability/store";
import type { IngestEvent, OpsEventKind } from "@/lib/observability/types";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set<OpsEventKind>([
  "api",
  "nav",
  "vital",
  "js_error",
  "server_error",
]);

export async function POST(request: NextRequest) {
  const auth = await requireAuthSession();
  if (auth instanceof NextResponse) return auth;

  const limit = checkRateLimit(`ops-ingest:${auth.userId}`);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.events) ? body.events : [];
  const events: IngestEvent[] = raw
    .filter((item: unknown) => item && typeof item === "object")
    .slice(0, 40)
    .map((item: Record<string, unknown>) => ({
      kind: KINDS.has(item.kind as OpsEventKind) ? (item.kind as OpsEventKind) : "api",
      path: typeof item.path === "string" ? item.path : undefined,
      status: typeof item.status === "number" ? item.status : undefined,
      ms: typeof item.ms === "number" ? item.ms : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
      value: typeof item.value === "number" ? item.value : undefined,
    }));

  if (!events.length) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  try {
    await recordOpsEvents(events);
    return NextResponse.json({ ok: true, accepted: events.length });
  } catch (err) {
    console.warn("[ops/ingest]", err);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
