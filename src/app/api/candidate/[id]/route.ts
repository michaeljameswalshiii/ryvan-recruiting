/**
 * Single Candidate API Route
 * GET /api/candidate/[id]
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { getLeadById } from '@/lib/db/repositories/lead-repository';

/**
 * GET /api/candidate/[id]
 * Get a single candidate by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get candidate from repository
    const candidate = await getLeadById(tenantId, id);
    
    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    console.error('[API] Failed to get candidate:', error);
    return NextResponse.json(
      { error: 'Failed to get candidate' },
      { status: 500 }
    );
  }
}
