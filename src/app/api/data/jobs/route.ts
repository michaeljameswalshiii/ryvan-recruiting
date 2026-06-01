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
  let session = null;
  
  try {
    // DEBUG: Log incoming request
    console.log('[JOBS-API] GET request received');
    console.log('[JOBS-API] URL:', request.url);
    
    // Get session for tenant isolation - wrapped in try-catch for safety
    try {
      session = await getSession();
      console.log('[JOBS-API] Session:', JSON.stringify(session));
    } catch (sessionError: any) {
      console.error('[JOBS-API] Session extraction error:', sessionError?.message);
      // Continue with null session - will be caught below
    }
    
    if (!session?.tenantId) {
      console.log('[JOBS-API] No session or tenantId - trying header injection from dashboard');
      
      // Try to get tenantId from request headers (set by dashboard middleware)
      const tenantId = request.headers.get('x-tenant-id');
      const userId = request.headers.get('x-user-id');
      
      console.log('[JOBS-API] Header tenantId:', tenantId);
      console.log('[JOBS-API] Header userId:', userId);
      
      // If we have tenantId from headers, create a mock session
      if (tenantId) {
        session = {
          tenantId,
          userId: userId || '',
        };
        console.log('[JOBS-API] Using session from headers');
      } else {
        console.log('[JOBS-API] No session or headers - returning 401');
        return NextResponse.json(
          { error: 'Unauthorized - no session found', details: 'Please log in again' },
          { status: 401 }
        );
      }
    }

    console.log('[JOBS_API] Tenant ID:', session.tenantId);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const includeStats = searchParams.get('includeStats') === 'true';

    console.log('[JOBS-API] includeStats:', includeStats);

    let jobs;

    if (status) {
      jobs = await getJobsByStatus(session.tenantId, status);
    } else {
      jobs = await getAllJobs(session.tenantId);
    }

    console.log('[JOBS-API] Jobs count:', jobs?.length || 0);

    let response: Record<string, unknown> = { jobs };

    if (includeStats) {
      const stats = await getJobStats(session.tenantId);
      response = { ...response, stats };
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[JOBS-API] GET error:', error);
    console.error('[JOBS-API] Error stack:', error?.stack);
    return NextResponse.json(
      { error: 'Failed to load jobs. Please try again.', details: error?.message || 'Unknown error' },
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
