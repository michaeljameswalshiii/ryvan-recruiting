/**
 * Jobs For Company API Route
 * GET /api/data/jobs/for-company/[id] - Get all open jobs for a company
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { getJobsForCompany } from '@/lib/db/repositories';

/**
 * GET - Get jobs for a company
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    
    // Get session for tenant isolation
    const session = await getSession();
    
    if (!session?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const jobs = await getJobsForCompany(session.tenantId, companyId);

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error('[JOBS-FOR-COMPANY-API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs for company' },
      { status: 500 }
    );
  }
}
