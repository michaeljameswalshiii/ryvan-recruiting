/**
 * Application-Centric Unlink Job API
 * Unlinks a candidate from a job, removing from linkedJobs[]
 * 
 * POST /api/data/leads/[id]/job/[jobId]/unlink
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { unlinkCandidateFromJobForApplication } from '@/lib/db/repositories/lead-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const leadIdFromPath = pathParts[pathParts.indexOf('leads') + 1];
    const jobIdFromPath = pathParts[pathParts.indexOf('job') + 2];
    
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Unlink the candidate from the job using repository function
    const updated = await unlinkCandidateFromJobForApplication(
      tenantId,
      leadIdFromPath,
      jobIdFromPath
    );

    if (!updated) {
      return NextResponse.json({ error: 'Failed to unlink job' }, { status: 500 });
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: any) {
    console.error('[UnlinkJob] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlink job' },
      { status: 500 }
    );
  }
}
