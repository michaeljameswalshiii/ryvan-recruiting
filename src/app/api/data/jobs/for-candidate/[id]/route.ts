/**
 * Jobs For Candidate API Route
 * GET /api/data/jobs/for-candidate/[id] - Get all jobs linked to a candidate
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { getJobsForCandidate } from '@/lib/db/repositories';

/**
 * GET - Get jobs for a candidate
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    
    // Get session for tenant isolation
    const session = await getSession();
    
    if (!session?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const jobs = await getJobsForCandidate(session.tenantId, candidateId);

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error('[JOBS-FOR-CANDIDATE-API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs for candidate' },
      { status: 500 }
    );
  }
}
