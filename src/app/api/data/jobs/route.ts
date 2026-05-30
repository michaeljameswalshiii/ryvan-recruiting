/**
 * Jobs API Routes
 * GET /api/data/jobs - Get all jobs
 * POST /api/data/jobs - Create a new job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { 
  getAllJobs, 
  getJobsByStatus,
  createJob,
  getJobStats,
} from '@/lib/db/repositories';

/**
 * GET - Get all jobs for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    // Get session for tenant isolation
    const session = await getSession();
    
    if (!session?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const includeStats = searchParams.get('includeStats') === 'true';

    let jobs;

    if (status) {
      jobs = await getJobsByStatus(session.tenantId, status);
    } else {
      jobs = await getAllJobs(session.tenantId);
    }

    let response: Record<string, unknown> = { jobs };

    if (includeStats) {
      const stats = await getJobStats(session.tenantId);
      response = { ...response, stats };
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[JOBS-API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new job
 */
export async function POST(request: NextRequest) {
  try {
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
    if (!body.title) {
      return NextResponse.json(
        { error: 'Job title is required' },
        { status: 400 }
      );
    }

    if (!body.companyId) {
      return NextResponse.json(
        { error: 'Company is required' },
        { status: 400 }
      );
    }

    if (!body.companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    const job = await createJob(session.tenantId, {
      title: body.title,
      description: body.description || '',
      location: body.location || '',
      salaryRange: body.salaryRange || '',
      employmentType: body.employmentType || 'Full-time',
      companyId: body.companyId,
      companyName: body.companyName,
      status: body.status || 'Open',
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error: any) {
    console.error('[JOBS-API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create job' },
      { status: 500 }
    );
  }
}
