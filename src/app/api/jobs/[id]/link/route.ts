/**
 * Job Candidate Link API Route
 * POST /api/jobs/[id]/link - Link candidate to job
 * DELETE /api/jobs/[id]/link - Unlink candidate from job
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { 
  getJobById, 
  linkCandidateToJob as linkCandidateToJobRepo,
  unlinkCandidateFromJob as unlinkCandidateFromJobRepo,
} from '@/lib/db/repositories/job-repository';
import { linkCandidateToJobSchema } from '@/lib/schemas/job';
import { 
  recordCandidateLinked,
  recordCandidateUnlinked,
} from '@/lib/events/job-events';

/**
 * POST /api/jobs/[id]/link
 * Link a candidate to a job
 */
export async function POST(
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
    const validated = linkCandidateToJobSchema.parse(body);

    // Get job for validation and event
    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if candidate already linked
    if (job.candidates?.some(c => c.candidateId === validated.candidateId)) {
      return NextResponse.json(
        { error: 'Candidate already linked to this job' },
        { status: 400 }
      );
    }

    // Link the candidate
    const updated = await linkCandidateToJobRepo(tenantId, jobId, validated);

    try {
      const { scheduleFitScoreOnLink } = await import(
        "@/lib/ai/schedule-fit-on-link"
      );
      scheduleFitScoreOnLink({
        tenantId,
        jobId,
        candidateId: validated.candidateId,
        createdBy: userEmail,
      });
    } catch (err) {
      console.warn("[JOBS_API] schedule fit after link:", err);
    }

    // Record event
    await recordCandidateLinked(
      jobId,
      job.title,
      validated.candidateId,
      validated.candidateName,
      validated.stage || 'Applied',
      userEmail
    );

    return NextResponse.json({ 
      success: true, 
      job: updated,
      message: 'Candidate linked successfully' 
    });
  } catch (error) {
    console.error('[JOBS_API] POST link error:', error);
    
    // Handle validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to link candidate' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[id]/link?candidateId=xxx
 * Unlink a candidate from a job
 */
export async function DELETE(
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

    // Get candidateId from query params
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidateId');
    
    if (!candidateId) {
      return NextResponse.json(
        { error: 'candidateId is required' },
        { status: 400 }
      );
    }

    // Get job for validation and event
    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Find candidate name for event
    const linkedCandidate = job.candidates?.find(c => c.candidateId === candidateId);
    if (!linkedCandidate) {
      return NextResponse.json(
        { error: 'Candidate not linked to this job' },
        { status: 400 }
      );
    }

    // Unlink the candidate
    const updated = await unlinkCandidateFromJobRepo(tenantId, jobId, candidateId);

    // Record event
    await recordCandidateUnlinked(
      jobId,
      job.title,
      candidateId,
      linkedCandidate.candidateName,
      userEmail
    );

    return NextResponse.json({ 
      success: true, 
      job: updated,
      message: 'Candidate unlinked successfully' 
    });
  } catch (error) {
    console.error('[JOBS_API] DELETE link error:', error);
    return NextResponse.json(
      { error: 'Failed to unlink candidate' },
      { status: 500 }
    );
  }
}
