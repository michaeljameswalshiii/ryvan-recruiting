/**
 * GET /api/sms/messages?candidateId= | ?contactId=&companyId=
 * List SMS thread for a candidate or company contact.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import {
  listMessagesForCandidate,
  listMessagesForContact,
  listRecentMessages,
  getConsent,
  getSmsConfig,
} from '@/lib/db/repositories/sms-repository';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getContactById } from '@/lib/db/repositories/contact-repository';
import { normalizeToE164 } from '@/lib/sms/phone';
import { getDisplayPhone, getPhoneByType } from '@/lib/contacts/phone';

function contactSmsPhone(contact: {
  phone?: string;
  preferredPhone?: string;
  phones?: Array<{ type?: string; number?: string; isPreferred?: boolean }>;
}): string {
  const mobile =
    getPhoneByType(contact, 'mobile') ||
    getPhoneByType(contact, 'cell') ||
    getPhoneByType(contact, 'direct') ||
    '';
  if (mobile.trim()) return mobile.trim();
  return getDisplayPhone(contact) || (contact.phone || '').trim();
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const candidateId = request.nextUrl.searchParams.get('candidateId');
    const contactId = request.nextUrl.searchParams.get('contactId');
    const companyId = request.nextUrl.searchParams.get('companyId');

    if (!candidateId && !contactId) {
      const messages = await listRecentMessages(tenantId, 40);
      return NextResponse.json({ messages });
    }

    const config = await getSmsConfig(tenantId);
    let messages;
    let consent = null;
    let phoneE164: string | null = null;

    if (contactId) {
      messages = await listMessagesForContact(tenantId, contactId);
      if (companyId) {
        try {
          const contact = await getContactById(tenantId, companyId, contactId);
          const phone = contact ? contactSmsPhone(contact) : '';
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
      }
    } else {
      messages = await listMessagesForCandidate(tenantId, candidateId!);
      try {
        const lead = await getLeadById(tenantId, candidateId!);
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
    }

    return NextResponse.json({ messages, consent, phoneE164 });
  } catch (error) {
    console.error('[SMS_MESSAGES]', error);
    return NextResponse.json(
      { error: 'Failed to load messages' },
      { status: 500 }
    );
  }
}
