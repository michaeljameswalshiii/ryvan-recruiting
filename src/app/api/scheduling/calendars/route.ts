/**
 * Calendar connections API (working hours + Google/Microsoft status)
 * GET / POST /api/scheduling/calendars
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import {
  listCalendars,
  upsertCalendar,
  getCalendar,
} from '@/lib/db/repositories/scheduling-repository';
import { upsertCalendarInputSchema } from '@/lib/schemas/scheduling';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await getSessionUserId();
    const calendars = await listCalendars(tenantId);
    const mine = userId ? await getCalendar(tenantId, userId) : null;
    return NextResponse.json({
      calendars,
      mine,
      providers: {
        google: {
          label: 'Google Calendar',
          status: mine?.provider === 'google' && mine.connected ? 'connected' : 'available',
          note: 'Connect via Email settings (Gmail OAuth) or mark connected with working hours below.',
        },
        microsoft: {
          label: 'Microsoft Outlook',
          status:
            mine?.provider === 'microsoft' && mine.connected ? 'connected' : 'available',
          note: 'Connect via Email settings (Outlook OAuth) or mark connected with working hours below.',
        },
        manual: {
          label: 'Manual working hours',
          status: 'always',
          note: 'Free/busy uses working hours + busy blocks until live calendar sync is enabled.',
        },
      },
    });
  } catch (error) {
    console.error('[SCHEDULING_CAL] GET', error);
    return NextResponse.json({ error: 'Failed to list calendars' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const parsed = upsertCalendarInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const calendar = await upsertCalendar(tenantId, userId, parsed.data);
    return NextResponse.json({ calendar });
  } catch (error) {
    console.error('[SCHEDULING_CAL] POST', error);
    return NextResponse.json({ error: 'Failed to save calendar' }, { status: 500 });
  }
}
