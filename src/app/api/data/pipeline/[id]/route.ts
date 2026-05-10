/**
 * PIPELINE [id] API Route
 * Server-only API for single pipeline/candidate operations
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { getPipelineById, updatePipelineItem, deletePipelineItem } from '@/lib/db/repositories/pipeline-repository';
import { updatePipelineSchema } from '@/lib/schemas/pipeline';

/**
 * GET /api/data/pipeline/[id]
 * Get a single pipeline item by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get pipeline from repository
    const pipeline = await getPipelineById(tenantId, id);

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ pipeline });
  } catch (error: any) {
    console.error('GET pipeline error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get pipeline item' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/data/pipeline/[id]
 * Update a pipeline item
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validated = updatePipelineSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Update pipeline with verified tenant ID
    const pipeline = await updatePipelineItem(tenantId, id, validated.data);

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ pipeline });
  } catch (error: any) {
    console.error('PUT pipeline error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update pipeline item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/data/pipeline/[id]
 * Delete a pipeline item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Delete pipeline
    await deletePipelineItem(tenantId, id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE pipeline error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete pipeline item' },
      { status: 500 }
    );
  }
}
