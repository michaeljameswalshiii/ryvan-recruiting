/**
 * Sequences API
 * GET  /api/sequences — list sequence definitions
 * POST /api/sequences — create sequence definition
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import {
  createSequence,
  listSequences,
} from '@/lib/db/repositories/sequence-repository';
import { createSequenceInputSchema } from '@/lib/schemas/sequence';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const sequences = await listSequences(tenantId);
    return NextResponse.json({ sequences });
  } catch (error) {
    console.error('[SEQUENCES_API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to list sequences' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const userId = await getSessionUserId();
    const body = await request.json().catch(() => ({}));
    const parsed = createSequenceInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sequence = await createSequence(
      tenantId,
      parsed.data,
      userId || undefined
    );

    return NextResponse.json({ sequence }, { status: 201 });
  } catch (error) {
    console.error('[SEQUENCES_API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create sequence' },
      { status: 500 }
    );
  }
}
