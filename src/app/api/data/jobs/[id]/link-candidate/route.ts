/**
 * Job Candidate Link API Routes
 * POST /api/data/jobs/[id]/link-candidate - Link a candidate to a job
 * DELETE /api/data/jobs/[id]/link-candidate - Unlink a candidate from a job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { 
  getJobById,
  linkCandidateToJob,
  unlinkCandidateFromJob,
  updateCandidateStageInJob,
} from '@/lib/db/repositories';

/**
 * POST - Link a candidate to a job
 */
export async function POST(
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

    if (!body.candidateName) {
      return NextResponse.json(
        { error: 'Candidate name is required' },
        { status: 400 }
      );
    }

    const job = await linkCandidateToJob(session.tenantId, jobId, {
      candidateId: body.candidateId,
      candidateName: body.candidateName,
      candidateEmail: body.candidateEmail,
      stage: body.stage || 'Applied',
      notes: body.notes,
    });

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error('[JOB-LINK-API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to link candidate to job' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Unlink a candidate from a job
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

    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidateId');

    if (!candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    const job = await unlinkCandidateFromJob(session.tenantId, jobId, candidateId);

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error('[JOB-LINK-API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlink candidate from job' },
      { status: 500 }
    );
  }
}
