/**
 * GET /api/sms/messages?candidateId= | ?contactId=&companyId=
 * List SMS thread for a candidate or company contact.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import {
  listMessagesForCandidate,
  listMessagesForContact,
  listRecentMessages,
  getConsent,
  getSmsConfig,
  listSmsConversationRoutes,
} from '@/lib/db/repositories/sms-repository';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getContactById } from '@/lib/db/repositories/contact-repository';
import { normalizeToE164 } from '@/lib/sms/phone';
import { getDisplayPhone, getPhoneByType } from '@/lib/contacts/phone';
import { isTenantAdminOrAbove } from '@/lib/roles';

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
    const [session, tenantId] = await Promise.all([
      getSession(),
      getSessionTenantId(),
    ]);
    if (!session || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const candidateId = request.nextUrl.searchParams.get('candidateId');
    const contactId = request.nextUrl.searchParams.get('contactId');
    const companyId = request.nextUrl.searchParams.get('companyId');
    const canViewAll = isTenantAdminOrAbove(session.role);

    if (!candidateId && !contactId) {
      const requestedScope = request.nextUrl.searchParams.get('scope');
      const scope = canViewAll && requestedScope === 'all'
        ? 'all'
        : canViewAll && requestedScope === 'unassigned'
          ? 'unassigned'
          : 'my';
      const [allMessages, routes] = await Promise.all([
        listRecentMessages(tenantId, 500),
        listSmsConversationRoutes(tenantId),
      ]);

      const routeForMessage = (message: (typeof allMessages)[number]) =>
        routes.find((route) => route.id === message.conversationKey) ||
        routes.find(
          (route) =>
            route.phoneE164 === message.phoneE164 &&
            (!message.originationIdentity ||
              route.destinationNumber === message.originationIdentity)
        ) ||
        routes.find(
          (route) =>
            (!!message.candidateId && route.candidateId === message.candidateId) ||
            (!!message.contactId && route.contactId === message.contactId)
        );

      const messages = allMessages.filter((message) => {
        if (scope === 'all') return true;
        const ownerUserId = routeForMessage(message)?.ownerUserId ||
          message.ownerUserId || message.createdBy;
        return scope === 'unassigned'
          ? !ownerUserId
          : ownerUserId === session.userId;
      });
      const visibleRoutes = routes.filter((route) =>
        scope === 'all'
          ? true
          : scope === 'unassigned'
            ? !route.ownerUserId
            : route.ownerUserId === session.userId
      );
      return NextResponse.json({
        messages,
        routes: visibleRoutes,
        scope,
        canViewAll,
        currentUserId: session.userId,
        unreadCount: visibleRoutes.reduce(
          (total, route) => total + (route.unreadCount || 0),
          0
        ),
      });
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

    if (!canViewAll) {
      const routes = await listSmsConversationRoutes(tenantId);
      messages = messages.filter((message) => {
        const route =
          routes.find((item) => item.id === message.conversationKey) ||
          routes.find(
            (item) =>
              item.phoneE164 === message.phoneE164 &&
              (!message.originationIdentity ||
                item.destinationNumber === message.originationIdentity)
          ) ||
          routes.find(
            (item) =>
              (!!message.candidateId && item.candidateId === message.candidateId) ||
              (!!message.contactId && item.contactId === message.contactId)
          );
        const ownerUserId = route?.ownerUserId ||
          message.ownerUserId || message.createdBy;
        return ownerUserId === session.userId;
      });
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
