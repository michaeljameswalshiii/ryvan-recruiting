/**
 * PIPELINE API Route
 * Server-only API for pipeline/candidates data
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { getAllPipeline, createPipelineItem, getPipelineById, updatePipelineItem, deletePipelineItem } from '@/lib/db/repositories/pipeline-repository';
import { createPipelineSchema, updatePipelineSchema, pipelineQuerySchema } from '@/lib/schemas/pipeline';

/**
 * GET /api/data/pipeline
 * Get all pipeline items for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const queryParams = pipelineQuerySchema.safeParse({
      limit: searchParams.get('limit'),
      cursor: searchParams.get('cursor'),
      stage: searchParams.get('stage'),
    });

    // Get pipeline from repository
    const pipeline = await getAllPipeline(tenantId);

    return NextResponse.json({ pipeline });
  } catch (error: any) {
    console.error('GET pipeline error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get pipeline' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/data/pipeline
 * Create a new pipeline item
 */
export async function POST(request: NextRequest) {
  try {
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    
    if (!tenantId || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validated = createPipelineSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Create pipeline item with verified tenant ID (never trust client-provided tenant_id)
    const pipeline = await createPipelineItem(tenantId, validated.data);

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error: any) {
    console.error('POST pipeline error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create pipeline item' },
      { status: 500 }
    );
  }
}
