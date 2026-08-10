/**
 * Send Email API
 * Send email via the signed-in user's connected Gmail or Outlook account.
 *
 * POST /api/email/send
 * Body: { to, subject, text?, html?, candidateId?, ... }
 * userId is taken from session (not trusted from client).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server-auth";
import { sendEmail } from "@/lib/email/send-email-service";
import { getActiveEmailConnections } from "@/lib/db/repositories/email-connection-repository";
import { z } from "zod";

const bodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  candidateId: z.string().optional(),
  candidateEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  threadId: z.string().optional(),
  references: z.string().optional(),
  inReplyTo: z.string().optional(),
  /** Optional preferred provider */
  provider: z.enum(["gmail", "outlook"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const active = await getActiveEmailConnections(session.userId);
    if (!active.length) {
      return NextResponse.json(
        {
          error:
            "No email account connected. Connect Gmail or Outlook in Settings, or use Gmail compose in the browser.",
          code: "NO_EMAIL_CONNECTION",
        },
        { status: 400 }
      );
    }

    const preferred =
      body.provider ||
      (active.some((c) => c.provider === "gmail")
        ? "gmail"
        : active[0]?.provider);

    const result = await sendEmail(
      session.userId,
      {
        from: active[0]?.emailAddress || "",
        to: body.to,
        subject: body.subject,
        text: body.text,
        html: body.html || body.text?.replace(/\n/g, "<br/>"),
        candidateId: body.candidateId,
        candidateEmail: body.candidateEmail || body.to,
        replyTo: body.replyTo,
        threadId: body.threadId,
        references: body.references,
        inReplyTo: body.inReplyTo,
      },
      preferred
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email", code: "SEND_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      from: active.find((c) => c.provider === result.provider)?.emailAddress,
    });
  } catch (error) {
    console.error("[Send Email] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
