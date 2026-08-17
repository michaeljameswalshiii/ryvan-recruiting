import { NextRequest, NextResponse } from "next/server";
import {
  isAgentScheduleEnabled,
  type PlatformAgentId,
} from "./platform-control";

export function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-cron-secret") || "";
  return bearer === secret || header === secret;
}

export function wantsForcedRun(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("force") === "1";
}

export async function skipIfScheduleOff(
  request: NextRequest,
  agentId: PlatformAgentId
): Promise<NextResponse | null> {
  if (wantsForcedRun(request)) return null;
  if (await isAgentScheduleEnabled(agentId)) return null;

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "disabled",
    agentId,
  });
}
