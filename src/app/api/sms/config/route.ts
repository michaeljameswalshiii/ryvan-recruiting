/**
 * SMS tenant config
 * GET / POST /api/sms/config
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { updateSmsConfigInputSchema } from '@/lib/schemas/sms';
import { getSmsSettings, saveSmsSettings } from '@/lib/sms/service';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const settings = await getSmsSettings(tenantId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[SMS_CONFIG] GET', error);
    return NextResponse.json({ error: 'Failed to load SMS config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await getSessionUserId();
    const body = await request.json().catch(() => ({}));
    const parsed = updateSmsConfigInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    await saveSmsSettings(tenantId, parsed.data, userId || undefined);
    const settings = await getSmsSettings(tenantId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[SMS_CONFIG] POST', error);
    return NextResponse.json({ error: 'Failed to save SMS config' }, { status: 500 });
  }
}
