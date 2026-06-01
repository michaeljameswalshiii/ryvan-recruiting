/**
 * Job Detail API Route
 * /api/jobs/[id]
 * GET - Get a single job
 * PUT - Update a job
 * DELETE - Delete a job
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { 
  getJobById, 
  updateJob as updateJobRepo,
  deleteJob as deleteJobRepo,
  linkCandidateToJob as linkCandidateToJobRepo,
  unlinkCandidateFromJob as unlinkCandidateFromJobRepo,
  updateCandidateStageInJob as updateCandidateStageInJobRepo,
} from '@/lib/db/repositories/job-repository';
import { updateJobSchema, linkCandidateToJobSchema, updateCandidateStageSchema } from '@/lib/schemas/job';
import { 
  recordJobUpdated, 
  recordJobStatusChanged,
  recordCandidateLinked,
  recordCandidateUnlinked,
  recordCandidateStageChanged,
} from '@/lib/events/job-events';

/**
 * GET /api/jobs/[id]
 * Get a single job by ID
 */
export async function GET(
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

    // Get the job
    const job = await getJobById(tenantId, jobId);
    
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('[JOBS_API] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/jobs/[id]
 * Update a job
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
    const validated = updateJobSchema.parse(body);

    // Get current job for comparison
    const currentJob = await getJobById(tenantId, jobId);
    if (!currentJob) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Track status changes for events
    let statusChanged = false;
    let oldStatus = currentJob.status;
    let newStatus = validated.status;

    if (newStatus && newStatus !== oldStatus) {
      statusChanged = true;
    }

    // Update the job
    const updated = await updateJobRepo(tenantId, jobId, validated);

    // Record events
    if (updated) {
      // Record general update
      const changes = Object.keys(validated).filter(k => validated[k as keyof typeof validated] !== undefined);
      if (changes.length > 0) {
        await recordJobUpdated(
          jobId,
          currentJob.title,
          validated as Record<string, unknown>,
          userEmail
        );
      }

      // Record status change
      if (statusChanged && newStatus) {
        await recordJobStatusChanged(
          jobId,
          currentJob.title,
          oldStatus || 'Unknown',
          newStatus,
          userEmail
        );
      }
    }

    return NextResponse.json({ 
      success: true, 
      job: updated,
      message: 'Job updated successfully' 
    });
  } catch (error) {
    console.error('[JOBS_API] PUT [id] error:', error);
    
    // Handle validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update job' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[id]
 * Delete a job
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

    // Verify job exists
    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Delete the job
    await deleteJobRepo(tenantId, jobId);

    return NextResponse.json({ 
      success: true, 
      message: 'Job deleted successfully' 
    });
  } catch (error) {
    console.error('[JOBS_API] DELETE [id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
