/**
 * Public self-schedule API (no auth)
 * GET  /api/public/schedule/[token] — link meta + available slots
 * POST /api/public/schedule/[token] — book a slot
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { bookInterviewInputSchema } from '@/lib/schemas/scheduling';
import { bookFromToken, getSlotsForLink } from '@/lib/scheduling/booking';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await getSlotsForLink(token);
    if ('error' in result && result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[PUBLIC_SCHEDULE] GET', error);
    return NextResponse.json({ error: 'Failed to load slots' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = bookInterviewInputSchema.safeParse({ ...body, token });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const result = await bookFromToken(parsed.data);
    if (!result.ok) {
      const status =
        result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'USED' || result.code === 'EXPIRED'
            ? 410
            : 400;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }
    return NextResponse.json({
      success: true,
      interview: {
        id: result.interview.id,
        title: result.interview.title,
        startAt: result.interview.startAt,
        endAt: result.interview.endAt,
        timezone: result.interview.timezone,
        locationType: result.interview.locationType,
        conferenceUrl: result.interview.conferenceUrl,
        status: result.interview.status,
      },
    });
  } catch (error) {
    console.error('[PUBLIC_SCHEDULE] POST', error);
    return NextResponse.json({ error: 'Failed to book' }, { status: 500 });
  }
}
