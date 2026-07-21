/**
 * Poll inbox for sequence replies (Gmail/Outlook) and auto-classify.
 * POST/GET — session auth
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from "@/lib/server-auth";
import { pollSequenceReplies } from "@/lib/sequences/reply-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantId =
      request.headers.get("x-tenant-id") ||
      session?.tenantId ||
      (await getSessionTenantId());
    const userId =
      request.headers.get("x-user-id") ||
      session?.userId ||
      (await getSessionUserId());

    if (!tenantId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let newerThanDays = 14;
    let limit = 30;
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.newerThanDays) newerThanDays = Number(body.newerThanDays) || 14;
      if (body.limit) limit = Number(body.limit) || 30;
    } else {
      const d = request.nextUrl.searchParams.get("days");
      const l = request.nextUrl.searchParams.get("limit");
      if (d) newerThanDays = parseInt(d, 10) || 14;
      if (l) limit = parseInt(l, 10) || 30;
    }

    const result = await pollSequenceReplies({
      tenantId,
      userId,
      newerThanDays,
      limit,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[sequences/poll-replies]", err);
    return NextResponse.json(
      { error: err?.message || "Poll failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
