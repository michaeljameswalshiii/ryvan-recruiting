/**
 * Job API Routes - Individual Job
 * GET /api/data/jobs/[id] - Get a job by ID
 * PUT /api/data/jobs/[id] - Update a job
 * DELETE /api/data/jobs/[id] - Delete a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { 
  getJobById, 
  updateJob,
  deleteJob,
  linkCandidateToJob,
  unlinkCandidateFromJob,
  updateCandidateStageInJob,
} from '@/lib/db/repositories';
import { linkCandidateToJobSchema, updateCandidateStageSchema } from '@/lib/schemas/job';

/**
 * GET - Get a job by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    
    // Get session for tenant isolation
    const session = await getSession();
    
    if (!session?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const job = await getJobById(session.tenantId, jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error('[JOB-API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update a job
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    
    // Get session for tenant isolation
    const session = await getSession();
    
    if (!session?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const job = await updateJob(session.tenantId, jobId, {
      title: body.title,
      description: body.description,
      location: body.location,
      salaryRange: body.salaryRange,
      employmentType: body.employmentType,
      companyId: body.companyId,
      companyName: body.companyName,
      status: body.status,
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error('[JOB-API] PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update job' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    
    // Get session for tenant isolation
    const session = await getSession();
    
    if (!session?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await deleteJob(session.tenantId, jobId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[JOB-API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete job' },
      { status: 500 }
    );
  }
}
