/**
 * Poll Gmail (and optionally Outlook) for replies from sequence candidates.
 * Auto-classify + stop sequence / stage update via handleEnrollmentReply.
 *
 * @serverOnly
 */

import { google } from "googleapis";
import { getGmailClient, getOutlookClient } from "@/lib/email/oauth-service";
import {
  listEnrollments,
  putEnrollmentPatch,
  getEnrollment,
  type EnrollmentHistoryEntry,
} from "@/lib/db/repositories/sequence-repository";
import { handleEnrollmentReply } from "@/lib/sequences/runner";
import { classifyReply } from "@/lib/sequences/reply";

export interface ReplyPollHit {
  enrollmentId: string;
  candidateId: string;
  candidateEmail: string;
  messageId: string;
  snippet: string;
  classification: string;
  stopped: boolean;
  stageSuggestion?: string;
}

export interface ReplyPollResult {
  scannedEnrollments: number;
  emailsChecked: number;
  repliesFound: number;
  hits: ReplyPollHit[];
  errors: string[];
  provider?: string;
}

function normalizeEmail(e?: string): string {
  return (e || "").trim().toLowerCase();
}

function alreadyProcessed(
  enrollment: { history?: EnrollmentHistoryEntry[]; processedMessageIds?: string[] },
  messageId: string
): boolean {
  const ids = (enrollment as any).processedMessageIds as string[] | undefined;
  if (Array.isArray(ids) && ids.includes(messageId)) return true;
  const hist = enrollment.history || [];
  return hist.some(
    (h) =>
      h.messageId === messageId ||
      (h.action === "reply_detected" && h.messageId === messageId)
  );
}

async function markProcessed(
  tenantId: string,
  enrollmentId: string,
  messageId: string,
  classification: string,
  snippet: string
): Promise<void> {
  const enrollment = await getEnrollment(tenantId, enrollmentId);
  if (!enrollment) return;
  const prev = enrollment as any;
  const processed: string[] = Array.isArray(prev.processedMessageIds)
    ? [...prev.processedMessageIds]
    : [];
  if (!processed.includes(messageId)) {
    processed.push(messageId);
    while (processed.length > 40) processed.shift();
  }
  await putEnrollmentPatch(tenantId, enrollmentId, {
    historyEntry: {
      at: new Date().toISOString(),
      stepIndex: enrollment.currentStepIndex,
      channel: "reply",
      action: "reply_detected",
      subject: classification,
      messageId,
    },
    processedMessageIds: processed,
    lastReplySnippet: snippet.slice(0, 300),
    lastReplyAt: new Date().toISOString(),
    lastReplyClassification: classification,
  });
}

/**
 * Extract plain text from Gmail message payload.
 */
function extractGmailBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, "base64url").toString("utf8");
    } catch {
      try {
        return Buffer.from(payload.body.data, "base64").toString("utf8");
      } catch {
        return "";
      }
    }
  }
  const parts = payload.parts || [];
  let text = "";
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      try {
        text += Buffer.from(p.body.data, "base64url").toString("utf8");
      } catch {
        try {
          text += Buffer.from(p.body.data, "base64").toString("utf8");
        } catch {
          /* skip */
        }
      }
    } else if (p.parts) {
      text += extractGmailBody(p);
    }
  }
  return text;
}

/**
 * Poll Gmail for replies matching active sequence enrollments for a user.
 */
export async function pollGmailReplies(params: {
  tenantId: string;
  userId: string;
  newerThanDays?: number;
  limit?: number;
}): Promise<ReplyPollResult> {
  const { tenantId, userId } = params;
  const newerThanDays = params.newerThanDays ?? 14;
  const limit = Math.min(params.limit ?? 30, 50);
  const errors: string[] = [];
  const hits: ReplyPollHit[] = [];

  const client = await getGmailClient(userId);
  if (!client) {
    return {
      scannedEnrollments: 0,
      emailsChecked: 0,
      repliesFound: 0,
      hits: [],
      errors: ["Gmail not connected for this user"],
      provider: "gmail",
    };
  }

  const gmail = google.gmail({ version: "v1", auth: client.oauth2Client });
  const enrollments = await listEnrollments(tenantId);
  const active = enrollments.filter(
    (e) =>
      e.status === "active" &&
      normalizeEmail(e.candidateEmail) &&
      (!e.enrolledByUserId ||
        e.enrolledByUserId === userId ||
        !(e as any).enrolledByUserId)
  );

  // Prefer enrollments owned by this user
  const owned = enrollments.filter(
    (e) =>
      e.status === "active" &&
      normalizeEmail(e.candidateEmail) &&
      (e as any).enrolledByUserId === userId
  );
  const toScan = (owned.length ? owned : active).slice(0, limit);

  let emailsChecked = 0;

  for (const enrollment of toScan) {
    const email = normalizeEmail(enrollment.candidateEmail);
    if (!email) continue;
    emailsChecked += 1;

    try {
      const q = `from:${email} newer_than:${newerThanDays}d -in:chats`;
      const list = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 5,
      });
      const messages = list.data.messages || [];
      if (!messages.length) continue;

      for (const m of messages) {
        const messageId = m.id || "";
        if (!messageId) continue;
        if (alreadyProcessed(enrollment as any, messageId)) continue;

        const full = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });
        const snippet =
          full.data.snippet ||
          extractGmailBody(full.data.payload).slice(0, 500) ||
          "";
        const bodyText =
          extractGmailBody(full.data.payload).slice(0, 2000) || snippet;

        // Skip if this looks like our own outbound (unlikely with from: filter)
        if (!bodyText.trim() && !snippet.trim()) continue;

        const classified = classifyReply(bodyText || snippet);
        const handled = await handleEnrollmentReply({
          tenantId,
          enrollmentId: enrollment.id,
          replyText: bodyText || snippet,
          classification: classified.classification,
          userId,
        });

        await markProcessed(
          tenantId,
          enrollment.id,
          messageId,
          classified.classification,
          snippet
        );

        hits.push({
          enrollmentId: enrollment.id,
          candidateId: enrollment.candidateId,
          candidateEmail: email,
          messageId,
          snippet: snippet.slice(0, 200),
          classification: handled.classification,
          stopped: handled.stopped,
          stageSuggestion: handled.stageSuggestion,
        });

        // One reply per enrollment per poll is enough
        break;
      }
    } catch (err: any) {
      errors.push(
        `${email}: ${err?.message || "Gmail search failed"}`
      );
    }
  }

  return {
    scannedEnrollments: toScan.length,
    emailsChecked,
    repliesFound: hits.length,
    hits,
    errors: errors.slice(0, 10),
    provider: "gmail",
  };
}

/**
 * Poll Outlook inbox for replies (best-effort).
 */
export async function pollOutlookReplies(params: {
  tenantId: string;
  userId: string;
  newerThanDays?: number;
  limit?: number;
}): Promise<ReplyPollResult> {
  const { tenantId, userId } = params;
  const newerThanDays = params.newerThanDays ?? 14;
  const limit = Math.min(params.limit ?? 30, 50);
  const errors: string[] = [];
  const hits: ReplyPollHit[] = [];

  const client = await getOutlookClient(userId);
  if (!client) {
    return {
      scannedEnrollments: 0,
      emailsChecked: 0,
      repliesFound: 0,
      hits: [],
      errors: ["Outlook not connected for this user"],
      provider: "outlook",
    };
  }

  const enrollments = await listEnrollments(tenantId);
  const owned = enrollments
    .filter(
      (e) =>
        e.status === "active" &&
        normalizeEmail(e.candidateEmail) &&
        ((e as any).enrolledByUserId === userId ||
          !(e as any).enrolledByUserId)
    )
    .slice(0, limit);

  let emailsChecked = 0;
  const since = new Date(
    Date.now() - newerThanDays * 24 * 60 * 60 * 1000
  ).toISOString();

  for (const enrollment of owned) {
    const email = normalizeEmail(enrollment.candidateEmail);
    if (!email) continue;
    emailsChecked += 1;

    try {
      // Filter messages from candidate
      const filter = `from/emailAddress/address eq '${email.replace(/'/g, "''")}' and receivedDateTime ge ${since}`;
      const res = await client.graphClient
        .api("/me/messages")
        .filter(filter)
        .top(5)
        .select("id,subject,bodyPreview,body,receivedDateTime")
        .orderby("receivedDateTime DESC")
        .get();

      const messages = res?.value || [];
      for (const m of messages) {
        const messageId = m.id || "";
        if (!messageId || alreadyProcessed(enrollment as any, messageId)) {
          continue;
        }
        const snippet = m.bodyPreview || m.body?.content || "";
        if (!String(snippet).trim()) continue;

        const classified = classifyReply(String(snippet));
        const handled = await handleEnrollmentReply({
          tenantId,
          enrollmentId: enrollment.id,
          replyText: String(snippet).slice(0, 2000),
          classification: classified.classification,
          userId,
        });

        await markProcessed(
          tenantId,
          enrollment.id,
          messageId,
          classified.classification,
          String(snippet).slice(0, 300)
        );

        hits.push({
          enrollmentId: enrollment.id,
          candidateId: enrollment.candidateId,
          candidateEmail: email,
          messageId,
          snippet: String(snippet).slice(0, 200),
          classification: handled.classification,
          stopped: handled.stopped,
          stageSuggestion: handled.stageSuggestion,
        });
        break;
      }
    } catch (err: any) {
      errors.push(`${email}: ${err?.message || "Outlook search failed"}`);
    }
  }

  return {
    scannedEnrollments: owned.length,
    emailsChecked,
    repliesFound: hits.length,
    hits,
    errors: errors.slice(0, 10),
    provider: "outlook",
  };
}

/**
 * Poll Gmail first, then Outlook if Gmail unavailable or found nothing and Outlook connected.
 */
export async function pollSequenceReplies(params: {
  tenantId: string;
  userId: string;
  newerThanDays?: number;
  limit?: number;
}): Promise<ReplyPollResult & { providers: string[] }> {
  const providers: string[] = [];
  const gmail = await pollGmailReplies(params);
  providers.push("gmail");

  if (gmail.repliesFound > 0 || gmail.errors[0]?.includes("not connected") === false) {
    // If gmail worked (even 0 replies), still try outlook only if gmail not connected
    if (!gmail.errors.some((e) => /not connected/i.test(e))) {
      return { ...gmail, providers };
    }
  }

  const outlook = await pollOutlookReplies(params);
  providers.push("outlook");

  if (gmail.repliesFound === 0 && outlook.repliesFound >= 0) {
    // Merge if gmail had connection errors
    if (gmail.errors.some((e) => /not connected/i.test(e))) {
      return { ...outlook, providers };
    }
  }

  return {
    scannedEnrollments:
      gmail.scannedEnrollments + outlook.scannedEnrollments,
    emailsChecked: gmail.emailsChecked + outlook.emailsChecked,
    repliesFound: gmail.repliesFound + outlook.repliesFound,
    hits: [...gmail.hits, ...outlook.hits],
    errors: [...gmail.errors, ...outlook.errors].slice(0, 15),
    providers,
    provider: gmail.repliesFound ? "gmail" : outlook.provider,
  };
}
