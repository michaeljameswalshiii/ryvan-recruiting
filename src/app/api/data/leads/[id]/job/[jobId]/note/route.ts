/**
 * Application-Centric Job-Specific Note API
 * Adds a note to a candidate's application for a specific job
 * 
 * POST /api/data/leads/[id]/job/[jobId]/note
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { addJobSpecificNote } from '@/lib/db/repositories/lead-repository';

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

    const body = await request.json();
    const { content, relatedStage } = body;

    if (!content) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    // Add the job-specific note using repository function
    const updated = await addJobSpecificNote(
      tenantId,
      leadIdFromPath,
      jobIdFromPath,
      content,
      relatedStage
    );

    if (!updated) {
      return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: any) {
console.error('[JobNoteAdd] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add note' },
      { status: 500 }
    );
  }
}
