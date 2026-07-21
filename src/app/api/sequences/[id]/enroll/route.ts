/**
 * Enroll a candidate in a sequence
 * POST /api/sequences/[id]/enroll  { candidateId, jobId? }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import {
  enrollCandidate,
  getSequence,
} from '@/lib/db/repositories/sequence-repository';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getJobById } from '@/lib/db/repositories/job-repository';
import { enrollCandidateInputSchema } from '@/lib/schemas/sequence';
import { generateAiFirstDraft } from '@/lib/sequences/draft';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const sequenceId = decodeURIComponent(id);
    const sequence = await getSequence(tenantId, sequenceId);
    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = enrollCandidateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { candidateId, jobId } = parsed.data;
    const candidate = await getLeadById(tenantId, candidateId);
    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    let jobTitle: string | undefined;
    let job = null as Awaited<ReturnType<typeof getJobById>>;
    if (jobId) {
      job = await getJobById(tenantId, jobId);
      jobTitle = job?.title;
    }

    const firstStep = sequence.steps?.[0];
    let drafts:
      | { stepId: string; subject?: string; body?: string }[]
      | undefined;

    if (firstStep) {
      try {
        const draft = await generateAiFirstDraft({
          candidate: {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            title: candidate.title,
            summary: candidate.summary,
            skills: candidate.skills,
            location: candidate.location,
          },
          job: job
            ? {
                id: job.id,
                title: job.title,
                companyName: job.companyName,
                description: job.description,
                location: job.location,
              }
            : null,
          sequence,
          step: firstStep,
        });
        drafts = [
          {
            stepId: firstStep.id,
            subject: draft.subject,
            body: draft.body,
          },
        ];
      } catch (err) {
        console.warn('[SEQUENCES_ENROLL] draft generation failed:', err);
      }
    }

    const enrollment = await enrollCandidate(tenantId, {
      sequenceId: sequence.id,
      candidateId,
      candidateName: candidate.name,
      candidateEmail: candidate.email || undefined,
      jobId,
      jobTitle,
      drafts,
      enrolledByUserId: userId || undefined,
    });

    // Optionally run first step immediately (same as quick-enroll)
    let runResult = null;
    const runFirst =
      body.runFirstStep === true || body.run_first_step === true;
    const firstDelay = sequence.steps?.[0]?.delayDays ?? 0;
    if (runFirst && firstDelay === 0 && userId) {
      try {
        const { runEnrollmentStep } = await import('@/lib/sequences/runner');
        runResult = await runEnrollmentStep({
          tenantId,
          userId,
          enrollmentId: enrollment.id,
          force: true,
        });
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json(
      { enrollment, runResult, firstStepRan: !!runResult?.success },
      { status: 201 }
    );
  } catch (error) {
    console.error('[SEQUENCES_API] enroll error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to enroll candidate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
