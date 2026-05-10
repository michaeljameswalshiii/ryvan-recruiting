/**
 * CLIENTS API Route
 * Server-only API for client/company data
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { getAllClients, createClient } from '@/lib/db/repositories/client-repository';
import { createClientSchema } from '@/lib/schemas/client';

/**
 * GET /api/data/clients
 * Get all clients for the current tenant
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

    // Get clients from repository
    const clients = await getAllClients(tenantId);

    return NextResponse.json({ clients });
  } catch (error: any) {
    console.error('GET clients error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get clients' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/data/clients
 * Create a new client
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
    const validated = createClientSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // Create client with verified tenant ID (never trust client-provided tenant_id)
    const client = await createClient(tenantId, validated.data);

    return NextResponse.json({ client }, { status: 201 });
  } catch (error: any) {
    console.error('POST clients error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create client' },
      { status: 500 }
    );
  }
}
