/**
 * Jobs API Route
 * GET /api/jobs - List all jobs for tenant
 * POST /api/jobs - Create a new job
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { 
  getAllJobs, 
  getOpenJobs, 
  createJob as createJobRepo,
  getJobsByStatus,
  getJobStats 
} from '@/lib/db/repositories/job-repository';
import { createJobSchema } from '@/lib/schemas/job';
import { recordJobCreated } from '@/lib/events/job-events';

/**
 * GET /api/jobs
 * List all jobs for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    // Get tenant from session
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const openOnly = searchParams.get('openOnly') === 'true';
    const stats = searchParams.get('stats') === 'true';

    // Return stats if requested
    if (stats) {
      const jobStats = await getJobStats(tenantId);
      return NextResponse.json(jobStats);
    }

    // Filter by status if provided
    let jobs;
    if (status) {
      jobs = await getJobsByStatus(tenantId, status);
    } else if (openOnly) {
      jobs = await getOpenJobs(tenantId);
    } else {
      jobs = await getAllJobs(tenantId);
    }

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[JOBS_API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs
 * Create a new job
 */
export async function POST(request: NextRequest) {
  try {
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
    const validated = createJobSchema.parse(body);

    // Create the job
    const job = await createJobRepo(tenantId, {
      ...validated,
      companyId: validated.companyId!,
      companyName: validated.companyName!,
    });

    // Record event
    await recordJobCreated(
      job.id!,
      job.title,
      job.companyName || 'Unknown',
      userEmail
    );

    return NextResponse.json({ 
      success: true, 
      job,
      message: 'Job created successfully' 
    });
  } catch (error) {
    console.error('[JOBS_API] POST error:', error);
    
    // Handle validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
}
