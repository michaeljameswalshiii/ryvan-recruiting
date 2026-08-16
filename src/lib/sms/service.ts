/**
 * High-level SMS send + inbound compliance handling.
 *
 * @serverOnly
 */

import {
  getSmsConfig,
  getConsent,
  upsertConsent,
  saveSmsMessage,
  listMessagesForCandidate,
  listMessagesForContact,
  listRecentMessages,
  getDailySendCount,
  incrementDailySendCount,
  updateSmsConfig,
  upsertSmsConversationRoute,
} from '@/lib/db/repositories/sms-repository';
import type {
  SendSmsInput,
  SmsMessage,
  SmsTenantConfig,
  UpdateSmsConfigInput,
  RecordConsentInput,
} from '@/lib/schemas/sms';
import { normalizeToE164 } from './phone';
import {
  classifyInboundKeyword,
  composeOutboundBody,
  complianceBlockMessage,
  helpAutoReply,
  isInQuietHours,
  startAutoReply,
  stopAutoReply,
  type ComplianceBlockReason,
} from './compliance';
import {
  getEnvOriginationIdentity,
  getProviderStatus,
  providerSendSms,
} from './provider';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getContactById } from '@/lib/db/repositories/contact-repository';
import { getDisplayPhone, getPhoneByType } from '@/lib/contacts/phone';
import { listObjectAssignments } from '@/lib/db/repositories/object-assignment-repository';
import { getProfileById } from '@/lib/db/repositories/profile-repository';

export type SendSmsResult =
  | { ok: true; message: SmsMessage; simulated: boolean }
  | { ok: false; error: string; code?: ComplianceBlockReason | string };

function resolveOrigination(config: SmsTenantConfig): string | undefined {
  return (
    config.originationIdentity ||
    getEnvOriginationIdentity() ||
    undefined
  );
}

export async function getSmsSettings(tenantId: string) {
  const config = await getSmsConfig(tenantId);
  const provider = getProviderStatus();
  const sentToday = await getDailySendCount(tenantId);
  return {
    config,
    provider,
    sentToday,
    originationEffective: resolveOrigination(config) || null,
  };
}

export async function saveSmsSettings(
  tenantId: string,
  input: UpdateSmsConfigInput,
  userId?: string
) {
  return updateSmsConfig(tenantId, input, userId);
}

export async function recordConsent(
  tenantId: string,
  input: RecordConsentInput
) {
  const config = await getSmsConfig(tenantId);
  const norm = normalizeToE164(input.phone, config.defaultCountry);
  if (!norm.ok) return { ok: false as const, error: norm.error };
  const record = await upsertConsent({
    tenantId,
    phoneE164: norm.e164,
    status: input.status,
    source: input.source,
    candidateId: input.candidateId,
    contactId: input.contactId,
    companyId: input.companyId,
    notes: input.notes,
  });
  return { ok: true as const, record };
}

function resolveContactSmsPhone(contact: {
  phone?: string;
  preferredPhone?: string;
  phones?: Array<{ type?: string; number?: string; isPreferred?: boolean }>;
}): string {
  // Prefer mobile/cell for SMS, then preferred display, then any phone
  const mobile =
    getPhoneByType(contact, 'mobile') ||
    getPhoneByType(contact, 'cell') ||
    getPhoneByType(contact, 'direct') ||
    '';
  if (mobile.trim()) return mobile.trim();
  return getDisplayPhone(contact) || (contact.phone || '').trim();
}

type SmsOwner = {
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
};

async function resolveConversationOwner(input: {
  tenantId: string;
  objectType: 'candidate' | 'contact';
  objectId: string;
  companyId?: string;
  senderUserId?: string;
}): Promise<SmsOwner> {
  try {
    let assignments = await listObjectAssignments(
      input.tenantId,
      input.objectType,
      input.objectId
    );
    if (
      assignments.length === 0 &&
      input.objectType === 'contact' &&
      input.companyId
    ) {
      assignments = await listObjectAssignments(
        input.tenantId,
        'company',
        input.companyId
      );
    }
    const priority = ['owner', 'recruiter', 'account_manager', 'collaborator'];
    const assigned = [...assignments].sort(
      (a, b) => priority.indexOf(a.role) - priority.indexOf(b.role)
    )[0];
    if (assigned) {
      return {
        ownerUserId: assigned.userId,
        ownerName: assigned.userName,
        ownerEmail: assigned.userEmail,
      };
    }
  } catch (error) {
    console.warn('[SMS] assignment lookup failed', error);
  }

  if (!input.senderUserId) return {};
  const profile = await getProfileById(input.senderUserId);
  return {
    ownerUserId: input.senderUserId,
    ownerName:
      profile?.tenant_id === input.tenantId ? profile.full_name : undefined,
    ownerEmail:
      profile?.tenant_id === input.tenantId ? profile.email : undefined,
  };
}

/**
 * Send SMS to a candidate or company contact (same compliance rules).
 * Prefer sendSmsToCandidate / sendSmsToContact wrappers for call sites.
 */
export async function sendSms(
  tenantId: string,
  input: SendSmsInput,
  userId?: string
): Promise<SendSmsResult> {
  const config = await getSmsConfig(tenantId);
  if (!config.enabled) {
    return {
      ok: false,
      error: complianceBlockMessage('disabled'),
      code: 'disabled',
    };
  }

  const isContact = !!input.contactId;
  let displayName: string | undefined;
  let rawPhone = input.phone || '';

  if (isContact) {
    if (!input.companyId && !rawPhone) {
      return {
        ok: false,
        error: 'Company is required when texting a contact',
        code: 'missing_company',
      };
    }
    // Load contact for name/phone when possible; if lookup fails but the UI
    // already sent a phone, still allow the send (avoids companyId mismatch).
    if (input.companyId) {
      try {
        const contact = await getContactById(
          tenantId,
          input.companyId,
          input.contactId!
        );
        if (contact) {
          displayName = contact.name;
          if (!rawPhone) {
            rawPhone = resolveContactSmsPhone(contact);
          }
        }
      } catch (err) {
        console.warn('[SMS] contact lookup failed', err);
      }
    }
    if (!rawPhone) {
      return {
        ok: false,
        error:
          'No phone number on this contact. Add a mobile/work number, then try again.',
        code: 'invalid_phone',
      };
    }
  } else if (input.candidateId) {
    const lead = await getLeadById(tenantId, input.candidateId);
    displayName = (lead as { name?: string } | null)?.name;
    if (!rawPhone) {
      rawPhone = (lead as { phone?: string } | null)?.phone || '';
    }
  } else {
    return {
      ok: false,
      error: 'candidateId or contactId is required',
      code: 'invalid_input',
    };
  }

  const norm = normalizeToE164(rawPhone, config.defaultCountry);
  if (!norm.ok) {
    return {
      ok: false,
      error: norm.error,
      code: 'invalid_phone',
    };
  }

  const owner = await resolveConversationOwner({
    tenantId,
    objectType: isContact ? 'contact' : 'candidate',
    objectId: isContact ? input.contactId! : input.candidateId!,
    companyId: input.companyId,
    senderUserId: userId,
  });

  let justRecordedOptIn = false;
  if (input.markConsent && input.consentSource) {
    try {
      await upsertConsent({
        tenantId,
        phoneE164: norm.e164,
        status: 'opted_in',
        source: input.consentSource,
        candidateId: input.candidateId,
        contactId: input.contactId,
        companyId: input.companyId,
      });
      justRecordedOptIn = true;
    } catch (err) {
      console.error('[SMS] markConsent upsert failed', err);
      return {
        ok: false,
        error:
          'Could not save opt-in consent. Check Settings → Texting is set up, then try Record opt-in again.',
        code: 'consent_write_failed',
      };
    }
  }

  const consent = await getConsent(tenantId, norm.e164);
  if (consent?.status === 'opted_out' && !justRecordedOptIn) {
    return {
      ok: false,
      error: complianceBlockMessage('opted_out'),
      code: 'opted_out',
    };
  }

  if (
    config.requireConsent &&
    consent?.status !== 'opted_in' &&
    !justRecordedOptIn
  ) {
    return {
      ok: false,
      error: complianceBlockMessage('consent_required'),
      code: 'consent_required',
    };
  }

  if (!input.bypassQuietHours && isInQuietHours(config)) {
    return {
      ok: false,
      error: complianceBlockMessage('quiet_hours'),
      code: 'quiet_hours',
    };
  }

  const sentToday = await getDailySendCount(tenantId);
  if (sentToday >= config.dailySendLimit) {
    return {
      ok: false,
      error: complianceBlockMessage('daily_limit'),
      code: 'daily_limit',
    };
  }

  const origination = resolveOrigination(config);
  const routeDestination = origination || `SIMULATED:${tenantId}`;

  const history = isContact
    ? await listMessagesForContact(tenantId, input.contactId!)
    : await listMessagesForCandidate(tenantId, input.candidateId!);
  const isFirst =
    history.filter((m) => m.direction === 'outbound').length === 0;
  const { body, segments } = composeOutboundBody(input.body, config, {
    isFirstMessage: isFirst,
  });

  const providerResult = await providerSendSms({
    toE164: norm.e164,
    body,
    originationIdentity: origination || 'SIMULATED',
    configurationSetName: config.configurationSetName,
  });

  const entityFields = isContact
    ? {
        contactId: input.contactId,
        contactName: displayName,
        companyId: input.companyId,
      }
    : {
        candidateId: input.candidateId,
        candidateName: displayName,
      };

  if (!providerResult.ok) {
    await saveSmsMessage(tenantId, {
      direction: 'outbound',
      status: 'failed',
      ...entityFields,
      phoneE164: norm.e164,
      body,
      segments,
      provider: providerResult.provider,
      errorMessage: providerResult.error,
      createdBy: userId,
      ...owner,
      originationIdentity: routeDestination,
    });
    return { ok: false, error: providerResult.error, code: 'provider_error' };
  }

  await incrementDailySendCount(tenantId, 1);

  const route = await upsertSmsConversationRoute({
    tenantId,
    destinationNumber: routeDestination,
    phoneE164: norm.e164,
    ...entityFields,
    ...owner,
    providerMessageId: providerResult.messageId,
  });

  const message = await saveSmsMessage(tenantId, {
    direction: 'outbound',
    status: providerResult.provider === 'simulated' ? 'simulated' : 'sent',
    ...entityFields,
    phoneE164: norm.e164,
    body,
    segments,
    provider: providerResult.provider,
    providerMessageId: providerResult.messageId,
    createdBy: userId,
    ownerUserId: route.ownerUserId,
    ownerName: route.ownerName,
    ownerEmail: route.ownerEmail,
    conversationKey: route.id,
    originationIdentity: route.destinationNumber,
  });

  // Soft activity note (non-fatal)
  try {
    const note = `SMS sent: ${body.slice(0, 200)}${body.length > 200 ? '…' : ''}`;
    if (isContact && input.contactId) {
      const { createEvent } = await import(
        '@/lib/db/repositories/event-repository'
      );
      await createEvent({
        contactId: input.contactId,
        companyId: input.companyId,
        type: 'Text Sent',
        content: note,
        createdBy: userId || 'system',
        metadata: { noteText: note, noteType: 'Text Sent', channel: 'sms' },
      });
    } else if (input.candidateId) {
      const { addNoteToCandidate } = await import(
        '@/lib/events/candidate-events'
      );
      await addNoteToCandidate(input.candidateId, note, userId || 'system', {
        noteType: 'Text Sent',
      });
    }
  } catch {
    /* optional */
  }

  return {
    ok: true,
    message,
    simulated: providerResult.provider === 'simulated',
  };
}

/** @deprecated prefer sendSms — kept for call sites */
export async function sendSmsToCandidate(
  tenantId: string,
  input: SendSmsInput,
  userId?: string
): Promise<SendSmsResult> {
  return sendSms(tenantId, input, userId);
}

export async function sendSmsToContact(
  tenantId: string,
  input: SendSmsInput,
  userId?: string
): Promise<SendSmsResult> {
  return sendSms(tenantId, input, userId);
}

/**
 * Handle inbound SMS (from AWS event destination → our webhook).
 */
export async function handleInboundSms(params: {
  tenantId: string;
  fromE164: string;
  body: string;
  providerMessageId?: string;
  candidateId?: string;
  candidateName?: string;
  contactId?: string;
  contactName?: string;
  companyId?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  conversationKey?: string;
  originationIdentity?: string;
}): Promise<{
  action: 'stop' | 'start' | 'help' | 'message';
  autoReply?: string;
  message: SmsMessage;
}> {
  const config = await getSmsConfig(params.tenantId);
  const keyword = classifyInboundKeyword(params.body);
  const recentMessages = await listRecentMessages(params.tenantId, 500);
  const priorMessage = recentMessages.find(
    (message) => message.phoneE164 === params.fromE164
  );
  const entityFields = {
    candidateId: params.candidateId || priorMessage?.candidateId,
    candidateName: params.candidateName || priorMessage?.candidateName,
    contactId: params.contactId || priorMessage?.contactId,
    contactName: params.contactName || priorMessage?.contactName,
    companyId: params.companyId || priorMessage?.companyId,
  };
  const routeFields = {
    ownerUserId: params.ownerUserId || priorMessage?.ownerUserId,
    ownerName: params.ownerName || priorMessage?.ownerName,
    ownerEmail: params.ownerEmail || priorMessage?.ownerEmail,
    conversationKey: params.conversationKey || priorMessage?.conversationKey,
    originationIdentity:
      params.originationIdentity || priorMessage?.originationIdentity,
  };

  let autoReply: string | undefined;
  if (keyword === 'stop') {
    await upsertConsent({
      tenantId: params.tenantId,
      phoneE164: params.fromE164,
      status: 'opted_out',
      source: 'manual',
      candidateId: entityFields.candidateId,
      contactId: entityFields.contactId,
      companyId: entityFields.companyId,
      lastKeyword: 'STOP',
    });
    autoReply = stopAutoReply(config);
  } else if (keyword === 'start') {
    await upsertConsent({
      tenantId: params.tenantId,
      phoneE164: params.fromE164,
      status: 'opted_in',
      source: 'inbound_start',
      candidateId: entityFields.candidateId,
      contactId: entityFields.contactId,
      companyId: entityFields.companyId,
      lastKeyword: 'START',
    });
    autoReply = startAutoReply(config);
  } else if (keyword === 'help') {
    autoReply = helpAutoReply(config);
  }

  const message = await saveSmsMessage(params.tenantId, {
    direction: 'inbound',
    status: 'received',
    ...entityFields,
    phoneE164: params.fromE164,
    body: params.body,
    segments: 1,
    provider: 'aws',
    providerMessageId: params.providerMessageId,
    ...routeFields,
  });

  try {
    const note = `SMS received: ${params.body.slice(0, 200)}${
      params.body.length > 200 ? '...' : ''
    }`;
    if (entityFields.contactId) {
      const { createEvent } = await import(
        '@/lib/db/repositories/event-repository'
      );
      await createEvent({
        contactId: entityFields.contactId,
        companyId: entityFields.companyId,
        type: 'Text Received',
        content: note,
        createdBy: 'system',
        metadata: { noteText: note, noteType: 'Text Received', channel: 'sms' },
      });
    } else if (entityFields.candidateId) {
      const { addNoteToCandidate } = await import(
        '@/lib/events/candidate-events'
      );
      await addNoteToCandidate(entityFields.candidateId, note, 'system', {
        noteType: 'Text Received',
      });
    }
  } catch {
    /* Activity logging is best effort; the SMS thread remains authoritative. */
  }

  if (autoReply) {
    const origination = resolveOrigination(config);
    await providerSendSms({
      toE164: params.fromE164,
      body: autoReply,
      originationIdentity: origination || 'SIMULATED',
      configurationSetName: config.configurationSetName,
    });
    await saveSmsMessage(params.tenantId, {
      direction: 'outbound',
      status: 'sent',
      ...entityFields,
      phoneE164: params.fromE164,
      body: autoReply,
      segments: 1,
      provider: origination ? 'aws' : 'simulated',
      createdBy: 'system',
      ...routeFields,
    });
  }

  return {
    action: keyword === 'none' ? 'message' : keyword,
    autoReply,
    message,
  };
}
