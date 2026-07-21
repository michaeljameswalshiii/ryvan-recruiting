/**
 * List sequence enrollments for tenant
 * GET /api/sequences/enrollments
 *
 * @serverOnly
 */

import { NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { listEnrollments } from '@/lib/db/repositories/sequence-repository';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized - no tenant found' },
        { status: 401 }
      );
    }

    const enrollments = await listEnrollments(tenantId);
    return NextResponse.json({ enrollments });
  } catch (error) {
    console.error('[SEQUENCES_API] enrollments GET error:', error);
    return NextResponse.json(
      { error: 'Failed to list enrollments' },
      { status: 500 }
    );
  }
}
