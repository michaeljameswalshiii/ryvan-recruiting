import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import {
  getCandidateEvents,
  recordEvent,
} from "@/lib/events/candidate-events";
import {
  normStatus,
  setCandidatePipelineStage,
} from "@/lib/candidates/stage-sync";
import { stageDisplayLabel } from "@/lib/candidates/note-type-stage";
import { getSession } from "@/lib/server-auth";

function eventId(event: any): string {
  return String(event?.id || event?.timestamp || "");
}

function transition(event: any) {
  const metadata = event?.metadata || {};
  return {
    previousStage: String(
      metadata.previousStage || metadata.oldStage || "",
    ).trim(),
    newStage: String(metadata.newStage || metadata.stage || "").trim(),
    jobId: String(
      metadata.jobId || metadata.job_id || event?.jobId || event?.job_id || "",
    ).trim(),
    changedStage:
      metadata.stageUpdated === true ||
      metadata.autoStageSync === true ||
      metadata.systemKind === "job_stage_change" ||
      (event?.eventType === "JOB_STAGE_CHANGED" &&
        metadata.systemKind !== "stage_undo"),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: candidateId } = await params;
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedEventId = String(body?.eventId || "").trim();
    if (!candidateId || !requestedEventId) {
      return NextResponse.json(
        { error: "Candidate ID and event ID are required" },
        { status: 400 },
      );
    }

    const candidate = await getLeadById(session.tenantId, candidateId);
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const result = await getCandidateEvents(candidateId, { limit: 200 });
    const events = result.events || [];
    const target = events.find((event) => eventId(event) === requestedEventId);
    if (!target) {
      return NextResponse.json(
        { error: "Stage-change activity was not found" },
        { status: 404 },
      );
    }

    const targetTransition = transition(target);
    if (
      !targetTransition.changedStage ||
      !targetTransition.previousStage ||
      !targetTransition.newStage ||
      targetTransition.previousStage === targetTransition.newStage ||
      !targetTransition.jobId
    ) {
      return NextResponse.json(
        { error: "This activity did not change a job stage" },
        { status: 400 },
      );
    }

    const undoneIds = new Set(
      events
        .map((event) => String(event?.metadata?.undoneEventId || "").trim())
        .filter(Boolean),
    );
    if (undoneIds.has(requestedEventId)) {
      return NextResponse.json(
        { error: "This stage change has already been undone" },
        { status: 409 },
      );
    }

    const latestActiveTransition = events.find((event) => {
      const candidateTransition = transition(event);
      const id = eventId(event);
      return (
        candidateTransition.changedStage &&
        candidateTransition.previousStage &&
        candidateTransition.newStage &&
        candidateTransition.jobId === targetTransition.jobId &&
        !undoneIds.has(id)
      );
    });
    if (eventId(latestActiveTransition) !== requestedEventId) {
      return NextResponse.json(
        { error: "A newer stage change exists. Undo that change first." },
        { status: 409 },
      );
    }

    const linkedJobs = Array.isArray((candidate as any).linkedJobs)
      ? (candidate as any).linkedJobs
      : [];
    const application = linkedJobs.find(
      (job: any) =>
        String(job?.jobId || job?.id || "") === targetTransition.jobId,
    );
    if (!application) {
      return NextResponse.json(
        { error: "The job application is no longer attached" },
        { status: 409 },
      );
    }
    if (normStatus(application.stage) !== normStatus(targetTransition.newStage)) {
      return NextResponse.json(
        { error: "The application stage has changed. Refresh before undoing." },
        { status: 409 },
      );
    }

    const stageResult = await setCandidatePipelineStage(
      candidateId,
      targetTransition.previousStage,
      {
        tenantId: session.tenantId,
        jobId: targetTransition.jobId,
      },
    );
    if (!stageResult.stageUpdated) {
      return NextResponse.json(
        { error: "The previous stage could not be restored" },
        { status: 500 },
      );
    }

    const metadata = target.metadata || {};
    const jobTitle = String(metadata.jobTitle || application.jobTitle || application.title || "Job");
    const fromLabel = stageDisplayLabel(targetTransition.newStage);
    const toLabel = stageDisplayLabel(targetTransition.previousStage);
    const actor = session.email || session.userId;
    const auditEvent = await recordEvent(
      candidateId,
      "JOB_STAGE_CHANGED",
      {
        title: "Stage change undone",
        description: `${jobTitle}: ${fromLabel} back to ${toLabel}`,
        metadata: {
          noteText: `Undid stage change on "${jobTitle}": ${fromLabel} back to ${toLabel}`,
          noteType: "Other",
          noteTypeLabel: "Other",
          systemKind: "stage_undo",
          jobId: targetTransition.jobId,
          jobTitle,
          companyName: metadata.companyName || application.companyName,
          previousStage: targetTransition.newStage,
          newStage: targetTransition.previousStage,
          stage: targetTransition.previousStage,
          undoneEventId: requestedEventId,
          actorUserId: session.userId,
          actorEmail: session.email,
        },
      },
      actor,
      { tenantId: session.tenantId },
    );

    return NextResponse.json({
      success: true,
      stage: targetTransition.previousStage,
      stageLabel: toLabel,
      eventId: auditEvent.eventId,
      auditRecorded: auditEvent.success,
    });
  } catch (error) {
    console.error("[undo-stage] Failed to undo stage activity:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to undo stage change" },
      { status: 500 },
    );
  }
}
