/**
 * Job Candidate Stage API Route
 * PUT /api/jobs/[id]/stage - Update candidate stage in a job
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { 
  getJobById, 
  updateCandidateStageInJob as updateCandidateStageInJobRepo,
} from '@/lib/db/repositories/job-repository';
import { updateCandidateStageSchema } from '@/lib/schemas/job';
import { 
  recordCandidateStageChanged,
} from '@/lib/events/job-events';

/**
 * PUT /api/jobs/[id]/stage
 * Update a candidate's stage in a job
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    
    // Get tenant from session
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    // Get user for createdBy
    const userId = await getSessionUserId();
    const userEmail = userId || 'system';

    // Parse and validate request body
    const body = await request.json();
    const validated = updateCandidateStageSchema.parse(body);

    // Get job for validation and event
    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Find candidate for validation and event
    const linkedCandidate = job.candidates?.find(c => c.candidateId === validated.candidateId);
    if (!linkedCandidate) {
      return NextResponse.json(
        { error: 'Candidate not linked to this job' },
        { status: 400 }
      );
    }

    const oldStage = linkedCandidate.stage;
    const newStage = validated.stage;

    // No change needed
    if (oldStage === newStage) {
      return NextResponse.json({ 
        success: true, 
        job,
        message: 'Stage unchanged' 
      });
    }

    // Update the candidate's stage
    const updated = await updateCandidateStageInJobRepo(tenantId, jobId, validated);

    // Record event
    await recordCandidateStageChanged(
      jobId,
      job.title,
      validated.candidateId,
      linkedCandidate.candidateName,
      oldStage,
      newStage,
      userEmail
    );

    return NextResponse.json({ 
      success: true, 
      job: updated,
      message: 'Stage updated successfully' 
    });
  } catch (error) {
    console.error('[JOBS_API] PUT stage error:', error);
    
    // Handle validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update stage' },
      { status: 500 }
    );
  }
}
