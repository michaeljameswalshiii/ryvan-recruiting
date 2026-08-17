/**
 * Candidate API Route
 * POST /api/candidate
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionTenantId,
  getSessionUserId,
  getSessionUserEmail,
} from '@/lib/server-auth';
import { createLead, getAllLeads } from '@/lib/db/repositories/lead-repository';
import { findDuplicateMatches } from '@/lib/candidates/duplicates';
import {
  incomingFromCreateFields,
  sanitizeCandidateCreateBody,
} from '@/lib/candidates/create-payload';

/**
 * POST /api/candidate
 * Create a new candidate
 */
export async function POST(
  request: NextRequest
) {
  try {
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    const userEmail = await getSessionUserEmail();
    
    if (!tenantId || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const fields = sanitizeCandidateCreateBody(body);

    if (!fields.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!fields.allowDuplicate) {
      try {
        const leads = await getAllLeads(tenantId);
        const matches = findDuplicateMatches(
          incomingFromCreateFields(fields),
          leads as any[]
        );
        if (matches.length) {
          return NextResponse.json(
            {
              error: 'Possible duplicate candidate found',
              code: 'DUPLICATE_CANDIDATE',
              matches,
            },
            { status: 409 }
          );
        }
      } catch (dupErr) {
        console.warn('[API] duplicate check skipped:', dupErr);
      }
    }

    const { allowDuplicate: _allow, ...createFields } = fields;
    void _allow;

    const lead = await createLead(
      tenantId,
      createFields as any,
      { userId, email: userEmail },
    );

    return NextResponse.json({
      success: true,
      candidate: lead,
    });
  } catch (error) {
    console.error('[API] Failed to create candidate:', error);
    return NextResponse.json(
      { error: 'Failed to create candidate' },
      { status: 500 }
    );
  }
}
