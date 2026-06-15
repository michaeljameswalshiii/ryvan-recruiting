/**
 * LEADS API Route
 * Server-only API for leads data
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { getAllLeadsWithLinkedJobs, createLead } from '@/lib/db/repositories/lead-repository';
import { createLeadSchema } from '@/lib/schemas/lead';

/**
 * GET /api/data/leads
 * Get all leads for the current tenant
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

// Get leads from repository (with enriched linked job data)
    const leads = await getAllLeadsWithLinkedJobs(tenantId);

    return NextResponse.json({ leads });
  } catch (error: any) {
    console.error('GET leads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get leads' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/data/leads
 * Create a new lead
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
    const validated = createLeadSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Create lead with verified tenant ID (never trust client-provided tenant_id)
    const lead = await createLead(tenantId, validated.data);

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error: any) {
    console.error('POST leads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create lead' },
      { status: 500 }
    );
  }
}
