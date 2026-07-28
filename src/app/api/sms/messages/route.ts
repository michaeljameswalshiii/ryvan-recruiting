/**
 * GET /api/sms/messages?candidateId= — list thread
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import {
  listMessagesForCandidate,
  listRecentMessages,
  getConsent,
  getSmsConfig,
} from '@/lib/db/repositories/sms-repository';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { normalizeToE164 } from '@/lib/sms/phone';

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const candidateId = request.nextUrl.searchParams.get('candidateId');
    if (!candidateId) {
      const messages = await listRecentMessages(tenantId, 40);
      return NextResponse.json({ messages });
    }

    const messages = await listMessagesForCandidate(tenantId, candidateId);
    const config = await getSmsConfig(tenantId);
    let consent = null;
    let phoneE164: string | null = null;
    try {
      const lead = await getLeadById(tenantId, candidateId);
      const phone = (lead as { phone?: string } | null)?.phone;
      if (phone) {
        const norm = normalizeToE164(phone, config.defaultCountry);
        if (norm.ok) {
          phoneE164 = norm.e164;
          consent = await getConsent(tenantId, norm.e164);
        }
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({ messages, consent, phoneE164 });
  } catch (error) {
    console.error('[SMS_MESSAGES]', error);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }
}
