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
import { createLead } from '@/lib/db/repositories/lead-repository';

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

    // Parse the request body
    const body = await request.json();
    const {
      name,
      email,
      phone,
      location,
      title,
      status = 'identification',
      source = 'manual',
      notes = '',
      linkedin_url = '',
      resume_url = '',
      tags = [],
    } = body;

    // Validate required fields
    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Create the lead
    const lead = await createLead(
      tenantId,
      {
        name: name.trim(),
        email: email?.trim() || '',
        phone: phone?.trim() || '',
        location: location?.trim() || '',
        title: title?.trim() || '',
        status,
        source,
        notes: notes?.trim() || '',
        linkedin_url: linkedin_url?.trim() || '',
        resume_url: resume_url?.trim() || '',
        tags: Array.isArray(tags)
          ? Array.from(
              new Set(
                tags
                  .map((tag: unknown) => String(tag).trim())
                  .filter(Boolean)
                  .slice(0, 25),
              ),
            )
          : [],
      },
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
