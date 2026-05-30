/**
 * Job Candidate Stage Update API Routes
 * PUT /api/data/jobs/[id]/update-stage - Update a candidate's stage in a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { 
  getJobById,
  updateCandidateStageInJob,
} from '@/lib/db/repositories';

/**
 * PUT - Update a candidate's stage in a job
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

    // Validate required fields
    if (!body.candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    if (!body.stage) {
      return NextResponse.json(
        { error: 'Stage is required' },
        { status: 400 }
      );
    }

    const job = await updateCandidateStageInJob(session.tenantId, jobId, {
      candidateId: body.candidateId,
      stage: body.stage,
      notes: body.notes,
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error('[JOB-STAGE-API] PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update candidate stage' },
      { status: 500 }
    );
  }
}
