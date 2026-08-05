/**
 * POST /api/sms/send — send SMS to a candidate or contact (compliance-checked)
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { sendSmsInputSchema } from '@/lib/schemas/sms';
import { sendSms } from '@/lib/sms/service';

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await getSessionUserId();
    const body = await request.json().catch(() => ({}));
    const parsed = sendSmsInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const result = await sendSms(
      tenantId,
      parsed.data,
      userId || undefined
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 }
      );
    }
    return NextResponse.json({
      message: result.message,
      simulated: result.simulated,
    });
  } catch (error) {
    console.error('[SMS_SEND]', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
