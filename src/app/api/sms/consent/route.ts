/**
 * POST /api/sms/consent — record opt-in / opt-out
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { recordConsentInputSchema } from '@/lib/schemas/sms';
import { recordConsent } from '@/lib/sms/service';

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const parsed = recordConsentInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const result = await recordConsent(tenantId, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ record: result.record });
  } catch (error) {
    console.error('[SMS_CONSENT]', error);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}
