/**
 * Sequence step runner — send due emails, create tasks, advance enrollments.
 *
 * @serverOnly
 */

import {
  getEnrollment,
  getSequence,
  listDueEnrollments,
  advanceEnrollment,
  stopEnrollment,
  putEnrollmentPatch,
} from "@/lib/db/repositories/sequence-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getJobById } from "@/lib/db/repositories/job-repository";
import {
  generateAiFirstDraft,
  buildFirstTouchDraft,
} from "@/lib/sequences/draft";
import { sendEmail } from "@/lib/email/send-email-service";
import { recordEmailSent, addNoteToCandidate } from "@/lib/events/candidate-events";
import type { SequenceEnrollment, SequenceStep } from "@/lib/schemas/sequence";

export interface StepRunResult {
  enrollmentId: string;
  candidateId: string;
  candidateName?: string;
  stepIndex: number;
  channel: string;
  action:
    | "email_sent"
    | "task_created"
    | "schedule_link_created"
    | "skipped"
    | "error"
    | "completed";
  success: boolean;
  message?: string;
  messageId?: string;
  scheduleUrl?: string;
}

export interface RunDueResult {
  processed: number;
  results: StepRunResult[];
}

function stepAt(enrollment: SequenceEnrollment, steps: SequenceStep[]) {
  return steps[enrollment.currentStepIndex];
}

async function resolveDraft(
  tenantId: string,
  enrollment: SequenceEnrollment,
  step: SequenceStep,
  recruiterName?: string
): Promise<{ subject: string; body: string }> {
  const existing = enrollment.drafts?.find((d) => d.stepId === step.id);
  if (existing?.subject || existing?.body) {
    return {
      subject: existing.subject || step.subject || "Following up",
      body: existing.body || step.bodyTemplate || "",
    };
  }

  const lead = await getLeadById(tenantId, enrollment.candidateId);
  const job = enrollment.jobId
    ? await getJobById(tenantId, enrollment.jobId)
    : null;
  const sequence = await getSequence(tenantId, enrollment.sequenceId);

  const candidate = {
    name: enrollment.candidateName || lead?.name,
    email: enrollment.candidateEmail || lead?.email,
    title: lead?.title,
    summary: lead?.summary,
    skills: lead?.skills,
    location: lead?.location,
  };
  const jobLike = job
    ? {
        title: job.title,
        companyName: job.companyName,
        description: job.description,
      }
    : enrollment.jobTitle
      ? { title: enrollment.jobTitle }
      : null;

  try {
    if (sequence) {
      const d = await generateAiFirstDraft({
        candidate,
        job: jobLike,
        sequence,
        step,
        recruiterName,
      });
      return { subject: d.subject, body: d.body };
    }
  } catch {
    /* fall through */
  }

  const d = buildFirstTouchDraft({
    candidate,
    job: jobLike,
    sequence: sequence || {
      id: enrollment.sequenceId,
      tenant_id: tenantId,
      type: "sequence_definition",
      name: "Sequence",
      steps: [step],
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    step,
    recruiterName,
  });
  return { subject: d.subject, body: d.body };
}

/**
 * Execute the current due step for one enrollment, then advance.
 */
export async function runEnrollmentStep(params: {
  tenantId: string;
  userId: string;
  enrollmentId: string;
  force?: boolean;
  recruiterName?: string;
}): Promise<StepRunResult> {
  const { tenantId, userId, enrollmentId, force, recruiterName } = params;
  const enrollment = await getEnrollment(tenantId, enrollmentId);
  if (!enrollment) {
    return {
      enrollmentId,
      candidateId: "",
      stepIndex: 0,
      channel: "unknown",
      action: "error",
      success: false,
      message: "Enrollment not found",
    };
  }

  if (enrollment.status !== "active") {
    return {
      enrollmentId: enrollment.id,
      candidateId: enrollment.candidateId,
      candidateName: enrollment.candidateName,
      stepIndex: enrollment.currentStepIndex,
      channel: "n/a",
      action: "skipped",
      success: false,
      message: `Enrollment is ${enrollment.status}`,
    };
  }

  if (!force) {
    const due = Date.parse(enrollment.nextRunAt);
    if (!Number.isNaN(due) && due > Date.now()) {
      return {
        enrollmentId: enrollment.id,
        candidateId: enrollment.candidateId,
        candidateName: enrollment.candidateName,
        stepIndex: enrollment.currentStepIndex,
        channel: "n/a",
        action: "skipped",
        success: false,
        message: "Not due yet",
      };
    }
  }

  const sequence = await getSequence(tenantId, enrollment.sequenceId);
  if (!sequence?.steps?.length) {
    return {
      enrollmentId: enrollment.id,
      candidateId: enrollment.candidateId,
      candidateName: enrollment.candidateName,
      stepIndex: enrollment.currentStepIndex,
      channel: "n/a",
      action: "error",
      success: false,
      message: "Sequence missing or has no steps",
    };
  }

  const step = stepAt(enrollment, sequence.steps);
  if (!step) {
    const done = await advanceEnrollment(tenantId, enrollment.id);
    return {
      enrollmentId: enrollment.id,
      candidateId: enrollment.candidateId,
      candidateName: enrollment.candidateName,
      stepIndex: enrollment.currentStepIndex,
      channel: "n/a",
      action: "completed",
      success: true,
      message: done?.status === "completed" ? "Sequence completed" : "No step",
    };
  }

  const base = {
    enrollmentId: enrollment.id,
    candidateId: enrollment.candidateId,
    candidateName: enrollment.candidateName,
    stepIndex: enrollment.currentStepIndex,
    channel: step.channel,
  };

  try {
    if (step.channel === "email") {
      const lead = await getLeadById(tenantId, enrollment.candidateId);
      const to =
        enrollment.candidateEmail ||
        lead?.email ||
        "";
      if (!to || !to.includes("@")) {
        return {
          ...base,
          action: "error",
          success: false,
          message: "Candidate has no email — cannot send. Pause or add email.",
        };
      }

      const draft = await resolveDraft(
        tenantId,
        enrollment,
        step,
        recruiterName
      );
      const html = draft.body
        .split("\n")
        .map((l) => l.trimEnd())
        .join("<br/>\n");

      const sendResult = await sendEmail(userId, {
        from: "",
        to,
        subject: draft.subject,
        text: draft.body,
        html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${html}</div>`,
        candidateId: enrollment.candidateId,
        candidateEmail: to,
      });

      if (!sendResult.success) {
        return {
          ...base,
          action: "error",
          success: false,
          message:
            sendResult.error ||
            "Email send failed — connect Gmail/Outlook in Settings",
        };
      }

      try {
        await recordEmailSent(
          enrollment.candidateId,
          draft.subject,
          to,
          userId,
          {
            sequenceId: enrollment.sequenceId,
            enrollmentId: enrollment.id,
            stepIndex: enrollment.currentStepIndex,
            messageId: sendResult.messageId,
            provider: sendResult.provider,
          }
        );
      } catch {
        /* non-fatal */
      }

      try {
        await addNoteToCandidate(
          enrollment.candidateId,
          `Sequence email sent (step ${enrollment.currentStepIndex + 1}): ${draft.subject}`,
          "sequence",
          {
            noteType: "Email",
            stage: "email",
            jobId: enrollment.jobId,
            jobTitle: enrollment.jobTitle,
          }
        );
      } catch {
        /* non-fatal */
      }

      await putEnrollmentPatch(tenantId, enrollment.id, {
        lastSentAt: new Date().toISOString(),
        lastMessageId: sendResult.messageId,
        lastChannel: "email",
        historyEntry: {
          at: new Date().toISOString(),
          stepIndex: enrollment.currentStepIndex,
          channel: "email",
          action: "email_sent",
          subject: draft.subject,
          messageId: sendResult.messageId,
        },
      });

      await advanceEnrollment(tenantId, enrollment.id);

      return {
        ...base,
        action: "email_sent",
        success: true,
        message: `Sent to ${to}`,
        messageId: sendResult.messageId,
      };
    }

    // Self-schedule link step — create booking link + optional email with URL
    if (step.channel === "schedule_link") {
      const { createLinkWithUrl } = await import("@/lib/scheduling/booking");
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://app.trio.local");
      const appBase = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;

      const { link, url } = await createLinkWithUrl(
        tenantId,
        {
          candidateId: enrollment.candidateId,
          candidateName: enrollment.candidateName,
          candidateEmail: enrollment.candidateEmail || "",
          jobId: enrollment.jobId,
          jobTitle: enrollment.jobTitle,
          planId: step.schedulePlanId,
          poolId: step.schedulePoolId,
          interviewTypeName:
            step.scheduleInterviewType || "Interview",
          durationMinutes: step.scheduleDurationMinutes || 30,
          stageOnBook: "interviewing",
          mode: "self_serve",
          enrollmentId: enrollment.id,
          sequenceId: enrollment.sequenceId,
          expiresInDays: 7,
        },
        appBase,
        userId
      );

      const lead = await getLeadById(tenantId, enrollment.candidateId);
      const to = enrollment.candidateEmail || lead?.email || "";
      let emailSent = false;
      let messageId: string | undefined;

      if (to?.includes("@")) {
        const subject =
          step.subject ||
          `Please pick a time — ${step.scheduleInterviewType || "Interview"}`;
        const body =
          (step.bodyTemplate ||
            `Hi {{candidateName}},\n\nPlease pick a time that works for you:\n\n{{scheduleUrl}}\n\nBest,\n{{recruiterName}}`)
            .replace(/\{\{candidateName\}\}/g, enrollment.candidateName || "there")
            .replace(/\{\{scheduleUrl\}\}/g, url)
            .replace(/\{\{recruiterName\}\}/g, recruiterName || "Recruiting")
            .replace(/\{\{jobTitle\}\}/g, enrollment.jobTitle || "the role");
        const html = body
          .split("\n")
          .map((l) => l.trimEnd())
          .join("<br/>\n");
        const sendResult = await sendEmail(userId, {
          from: "",
          to,
          subject,
          text: body,
          html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${html}</div>`,
          candidateId: enrollment.candidateId,
          candidateEmail: to,
        });
        emailSent = sendResult.success;
        messageId = sendResult.messageId;
      }

      try {
        await addNoteToCandidate(
          enrollment.candidateId,
          `Schedule link created (step ${enrollment.currentStepIndex + 1}): ${url}${emailSent ? " · emailed" : " · email skipped (no address or send failed)"}`,
          "sequence",
          {
            noteType: "Task",
            stage: "interviewing",
            jobId: enrollment.jobId,
            jobTitle: enrollment.jobTitle,
          }
        );
      } catch {
        /* non-fatal */
      }

      await putEnrollmentPatch(tenantId, enrollment.id, {
        lastSentAt: new Date().toISOString(),
        lastMessageId: messageId,
        lastChannel: "schedule_link",
        historyEntry: {
          at: new Date().toISOString(),
          stepIndex: enrollment.currentStepIndex,
          channel: "schedule_link",
          action: "schedule_link_created",
          subject: link.interviewTypeName,
          messageId,
        },
      });

      await advanceEnrollment(tenantId, enrollment.id);

      return {
        ...base,
        action: "schedule_link_created",
        success: true,
        message: url,
        messageId,
        scheduleUrl: url,
      };
    }

    // Task or LinkedIn task — create activity, do not send email
    const draft = await resolveDraft(tenantId, enrollment, step, recruiterName);
    const taskTitle =
      step.taskTitle ||
      (step.channel === "linkedin_task"
        ? `LinkedIn touch — ${enrollment.candidateName || "candidate"}`
        : `Follow up — ${enrollment.candidateName || "candidate"}`);

    const noteBody = [
      `Sequence task (step ${enrollment.currentStepIndex + 1}): ${taskTitle}`,
      enrollment.jobTitle ? `Job: ${enrollment.jobTitle}` : "",
      draft.body ? `\nSuggested note:\n${draft.body}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await addNoteToCandidate(enrollment.candidateId, noteBody, "sequence", {
        noteType: step.channel === "linkedin_task" ? "LinkedIn" : "Task",
        stage: "contacted",
        jobId: enrollment.jobId,
        jobTitle: enrollment.jobTitle,
      });
    } catch {
      /* non-fatal */
    }

    await putEnrollmentPatch(tenantId, enrollment.id, {
      lastSentAt: new Date().toISOString(),
      lastChannel: step.channel,
      historyEntry: {
        at: new Date().toISOString(),
        stepIndex: enrollment.currentStepIndex,
        channel: step.channel,
        action: "task_created",
        subject: taskTitle,
      },
    });

    await advanceEnrollment(tenantId, enrollment.id);

    return {
      ...base,
      action: "task_created",
      success: true,
      message: taskTitle,
    };
  } catch (err) {
    return {
      ...base,
      action: "error",
      success: false,
      message: err instanceof Error ? err.message : "Step failed",
    };
  }
}

/**
 * Process all due enrollments for a tenant.
 */
export async function runDueEnrollments(params: {
  tenantId: string;
  userId: string;
  limit?: number;
  recruiterName?: string;
}): Promise<RunDueResult> {
  const due = await listDueEnrollments(params.tenantId);
  const limit = Math.min(params.limit ?? 25, 50);
  const slice = due.slice(0, limit);
  const results: StepRunResult[] = [];

  for (const e of slice) {
    const r = await runEnrollmentStep({
      tenantId: params.tenantId,
      userId: params.userId,
      enrollmentId: e.id,
      force: false,
      recruiterName: params.recruiterName,
    });
    results.push(r);
  }

  return { processed: results.length, results };
}

/**
 * Stop sequence after a reply (positive/negative) and optionally leave a note.
 */
export async function handleEnrollmentReply(params: {
  tenantId: string;
  enrollmentId: string;
  replyText?: string;
  classification?: "positive" | "negative" | "neutral" | "ooo";
  userId?: string;
}): Promise<{
  enrollment: SequenceEnrollment | null;
  classification: string;
  stageSuggestion?: string;
  stopped: boolean;
}> {
  const { classifyReply } = await import("@/lib/sequences/reply");
  const classification =
    params.classification ||
    classifyReply(params.replyText || "").classification;

  const enrollment = await getEnrollment(
    params.tenantId,
    params.enrollmentId
  );
  if (!enrollment) {
    return {
      enrollment: null,
      classification,
      stopped: false,
    };
  }

  let stageSuggestion: string | undefined;
  if (classification === "positive") stageSuggestion = "interested";
  else if (classification === "negative") stageSuggestion = "not_interested";
  else if (classification === "ooo") stageSuggestion = undefined;
  else stageSuggestion = "contacted";

  // Stop sequence unless OOO (pause-like: stop for now so we don't spam)
  const shouldStop = classification !== "neutral" || !!params.replyText;
  let updated = enrollment;
  if (shouldStop && classification !== "ooo") {
    updated =
      (await stopEnrollment(params.tenantId, enrollment.id)) || enrollment;
  } else if (classification === "ooo") {
    // Push next run 7 days
    updated =
      (await putEnrollmentPatch(params.tenantId, enrollment.id, {
        nextRunAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        historyEntry: {
          at: new Date().toISOString(),
          stepIndex: enrollment.currentStepIndex,
          channel: "reply",
          action: "ooo_deferred",
          subject: "Out of office — deferred 7 days",
        },
      })) || enrollment;
  } else {
    updated =
      (await stopEnrollment(params.tenantId, enrollment.id)) || enrollment;
  }

  try {
    const note = [
      `Sequence reply logged (${classification})`,
      params.replyText ? `Reply:\n${params.replyText}` : "",
      stageSuggestion ? `Suggested stage: ${stageSuggestion}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    await addNoteToCandidate(enrollment.candidateId, note, "sequence-reply", {
      noteType: "Email",
      stage: stageSuggestion || "contacted",
      jobId: enrollment.jobId,
      jobTitle: enrollment.jobTitle,
    });
  } catch {
    /* ignore */
  }

  // Apply stage on job + lead link when we have a clear signal
  if (
    enrollment.jobId &&
    stageSuggestion &&
    (classification === "positive" || classification === "negative")
  ) {
    try {
      const { updateCandidateStageInJob } = await import(
        "@/lib/db/repositories/lead-repository"
      );
      await updateCandidateStageInJob(
        params.tenantId,
        enrollment.candidateId,
        enrollment.jobId,
        stageSuggestion,
        params.userId
      );
    } catch {
      /* stage update best-effort */
    }
  }

  return {
    enrollment: updated,
    classification,
    stageSuggestion,
    stopped: shouldStop && classification !== "ooo",
  };
}
