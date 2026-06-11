/**
 * Application-Centric Stage Update API
 * Updates candidate stage for a specific job using linkedJobs[]
 * 
 * PUT /api/data/leads/[id]/job/[jobId]/stage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { updateCandidateStageInJob } from '@/lib/db/repositories/lead-repository';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { id: leadId } = await params;
    
    // Get leadId from URL params
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const leadIdFromPath = pathParts[pathParts.indexOf('leads') + 1];
    const jobIdFromPath = pathParts[pathParts.indexOf('job') + 2];
    
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { stage } = body;

    if (!stage) {
      return NextResponse.json({ error: 'Stage is required' }, { status: 400 });
    }

    // Update the stage using repository function
    const updated = await updateCandidateStageInJob(
      tenantId,
      leadIdFromPath,
      jobIdFromPath,
      stage
    );

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: any) {
    console.error('[StageUpdate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update stage' },
      { status: 500 }
    );
  }
}
