/**
 * Preview / generate outreach draft
 * POST /api/sequences/draft
 *   { candidateId, jobId?, sequenceId?, stepIndex? }
 * Returns { subject, body }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSession } from '@/lib/server-auth';
import { getSequence } from '@/lib/db/repositories/sequence-repository';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getJobById } from '@/lib/db/repositories/job-repository';
import { generateAiFirstDraft } from '@/lib/sequences/draft';
import { z } from 'zod';

const draftBodySchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().optional(),
  sequenceId: z.string().optional(),
  stepIndex: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = draftBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { candidateId, jobId, sequenceId, stepIndex } = parsed.data;

    const candidate = await getLeadById(tenantId, candidateId);
    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    const job = jobId ? await getJobById(tenantId, jobId) : null;
    const sequence = sequenceId
      ? await getSequence(tenantId, sequenceId)
      : null;

    const idx = stepIndex ?? 0;
    const step = sequence?.steps?.[idx] ?? null;

    let recruiterName: string | undefined;
    try {
      const session = await getSession();
      recruiterName = session?.email?.split('@')[0] || undefined;
    } catch {
      /* ignore */
    }

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
      step,
      recruiterName,
    });

    return NextResponse.json({
      subject: draft.subject,
      body: draft.body,
      source: draft.source,
      channel: step?.channel || 'email',
      stepId: step?.id,
    });
  } catch (error) {
    console.error('[SEQUENCES_API] draft error:', error);
    return NextResponse.json(
      { error: 'Failed to generate draft' },
      { status: 500 }
    );
  }
}
