/**
 * Single Candidate API Route
 * GET /api/candidate/[id]
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { getLeadById, deleteLead, updateLead } from '@/lib/db/repositories/lead-repository';

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

/**
 * DELETE /api/candidate/[id]
 * Delete a candidate
 */
export async function DELETE(
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

    // Verify candidate exists
    const candidate = await getLeadById(tenantId, id);
    
    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Delete the candidate
    await deleteLead(tenantId, id);

return NextResponse.json({ 
      success: true, 
      message: 'Candidate deleted successfully' 
    });
  } catch (error) {
    console.error('[API] Failed to delete candidate:', error);
    return NextResponse.json(
      { error: 'Failed to delete candidate' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/candidate/[id]
 * Update a candidate
 */
export async function PUT(
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

    // Verify candidate exists
    const existing = await getLeadById(tenantId, id);
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // Parse body
    const body = await request.json();

    // Update the candidate
    const updated = await updateLead(tenantId, id, body);

    return NextResponse.json({ 
      success: true, 
      candidate: updated 
    });
  } catch (error) {
    console.error('[API] Failed to update candidate:', error);
    return NextResponse.json(
      { error: 'Failed to update candidate' },
      { status: 500 }
    );
  }
}
