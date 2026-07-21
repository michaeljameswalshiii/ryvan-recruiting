/**
 * Log a candidate reply on a sequence enrollment → classify, stop, stage.
 * POST { replyText?, classification? }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from "@/lib/server-auth";
import { handleEnrollmentReply } from "@/lib/sequences/runner";
import { classifyReply } from "@/lib/sequences/reply";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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

    const body = await request.json().catch(() => ({}));
    const replyText = String(body.replyText || body.text || body.reply || "");
    let classification = body.classification as
      | "positive"
      | "negative"
      | "neutral"
      | "ooo"
      | undefined;

    if (!classification && replyText) {
      classification = classifyReply(replyText).classification;
    }
    if (!classification) {
      return NextResponse.json(
        { error: "replyText or classification is required" },
        { status: 400 }
      );
    }

    const result = await handleEnrollmentReply({
      tenantId,
      enrollmentId: id,
      replyText,
      classification,
      userId,
    });

    if (!result.enrollment) {
      return NextResponse.json(
        { error: "Enrollment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      classify: replyText ? classifyReply(replyText) : null,
    });
  } catch (err: any) {
    console.error("[sequences/reply]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to log reply" },
      { status: 500 }
    );
  }
}
