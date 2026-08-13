/**
 * Application-Centric Link Job API
 * Links a candidate to a job using the new linkedJobs[] structure
 * 
 * POST /api/data/leads/[id]/job/link
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { linkCandidateToJobForApplication } from '@/lib/db/repositories/lead-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const leadIdFromPath = pathParts[pathParts.indexOf('leads') + 1];
    
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { jobId, jobTitle, companyId, companyName, initialStage = 'sourced' } = body;

    if (!jobId || !jobTitle) {
      return NextResponse.json({ error: 'jobId and jobTitle are required' }, { status: 400 });
    }

    // Link + activity log happen in repository
    const updated = await linkCandidateToJobForApplication(
      tenantId,
      leadIdFromPath,
      jobId,
      jobTitle,
      companyId,
      companyName,
      initialStage
    );

    if (!updated) {
      return NextResponse.json({ error: 'Failed to link job' }, { status: 500 });
    }

    try {
      const { scheduleFitScoreOnLink } = await import(
        "@/lib/ai/schedule-fit-on-link"
      );
      scheduleFitScoreOnLink({
        tenantId,
        jobId,
        candidateId: leadIdFromPath,
      });
    } catch (err) {
      console.warn("[LinkJob] schedule fit after link:", err);
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: any) {
    console.error('[LinkJob] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to link job' },
      { status: 500 }
    );
  }
}
