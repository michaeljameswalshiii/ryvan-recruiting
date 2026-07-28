/**
 * Public client interviewer portal API
 * GET  — portal meta + upcoming interviews for linked jobs
 * POST — submit availability blocks
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getClientPortalByToken,
  listInterviews,
  updateClientPortal,
} from '@/lib/db/repositories/scheduling-repository';
import { z } from 'zod';

const availabilitySchema = z.object({
  availability: z.array(
    z.object({
      start: z.string().min(1),
      end: z.string().min(1),
    })
  ),
  timezone: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const portal = await getClientPortalByToken(token);
    if (!portal || !portal.active) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }
    if (portal.expiresAt && new Date(portal.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Portal expired' }, { status: 410 });
    }

    const interviews = await listInterviews(portal.tenant_id);
    const relevant = interviews.filter((iv) => {
      if (['cancelled', 'no_show'].includes(iv.status)) return false;
      if (portal.jobIds?.length && iv.jobId) {
        return portal.jobIds.includes(iv.jobId);
      }
      // Show interviews where this client email is a participant
      return (iv.participants || []).some(
        (p) =>
          p.email.toLowerCase() === portal.contactEmail.toLowerCase() ||
          p.role === 'client'
      );
    });

    return NextResponse.json({
      portal: {
        clientName: portal.clientName,
        contactName: portal.contactName,
        contactEmail: portal.contactEmail,
        timezone: portal.timezone,
        availability: portal.availability,
        expiresAt: portal.expiresAt,
      },
      interviews: relevant.map((iv) => ({
        title: iv.title,
        startAt: iv.startAt,
        endAt: iv.endAt,
        status: iv.status,
        candidateName: iv.candidateName,
        jobTitle: iv.jobTitle,
        locationType: iv.locationType,
        conferenceUrl: iv.conferenceUrl,
      })),
    });
  } catch (error) {
    console.error('[CLIENT_PORTAL] GET', error);
    return NextResponse.json({ error: 'Failed to load portal' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const portal = await getClientPortalByToken(token);
    if (!portal || !portal.active) {
      return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid availability', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateClientPortal({
      ...portal,
      availability: parsed.data.availability,
      timezone: parsed.data.timezone || portal.timezone,
    });

    return NextResponse.json({
      success: true,
      availability: updated.availability,
      timezone: updated.timezone,
    });
  } catch (error) {
    console.error('[CLIENT_PORTAL] POST', error);
    return NextResponse.json(
      { error: 'Failed to save availability' },
      { status: 500 }
    );
  }
}
