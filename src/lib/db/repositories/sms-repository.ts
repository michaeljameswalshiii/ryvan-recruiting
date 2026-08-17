/**
 * SMS repository — config, consent, messages in profiles table.
 *
 * @serverOnly
 */

import { getItem, putItem, scanItems, tableNames } from '../dynamodb';
import type {
  SmsTenantConfig,
  UpdateSmsConfigInput,
  SmsConsentRecord,
  SmsMessage,
  SmsConsentSource,
} from '../../schemas/sms';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function configKey(tenantId: string) {
  return `sms-config#${tenantId}`;
}
function consentKey(tenantId: string, phoneE164: string) {
  return `sms-consent#${tenantId}#${phoneE164}`;
}
function messageKey(tenantId: string, id: string) {
  return `sms-msg#${tenantId}#${id}`;
}
function msgIndexKey(tenantId: string) {
  return `sms-msg-index#${tenantId}`;
}
function candMsgIndexKey(tenantId: string, candidateId: string) {
  return `sms-cand-msg#${tenantId}#${candidateId}`;
}
function contactMsgIndexKey(tenantId: string, contactId: string) {
  return `sms-contact-msg#${tenantId}#${contactId}`;
}
function dailyCountKey(tenantId: string, day: string) {
  return `sms-daily#${tenantId}#${day}`;
}

interface IdIndex {
  id: string;
  tenant_id: string;
  type: string;
  ids: string[];
  updatedAt: string;
}

export interface SmsConversationRoute {
  id: string;
  tenant_id: string;
  type: 'sms_conversation_route';
  destinationNumber: string;
  phoneE164: string;
  candidateId?: string;
  candidateName?: string;
  contactId?: string;
  contactName?: string;
  companyId?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  lastProviderMessageId?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

type SmsProviderRoute = {
  id: string;
  tenant_id: string;
  type: 'sms_provider_route';
  conversationKey: string;
  createdAt: string;
};

function conversationRouteKey(destinationNumber: string, phoneE164: string) {
  return `sms-route#${destinationNumber}#${phoneE164}`;
}

function providerRouteKey(providerMessageId: string) {
  return `sms-provider-route#${providerMessageId}`;
}

async function getIndex(key: string): Promise<IdIndex | null> {
  try {
    return await getItem<IdIndex>(tableNames.profiles, { id: key });
  } catch {
    return null;
  }
}

async function addToIndex(
  key: string,
  tenantId: string,
  type: string,
  itemId: string,
  max = 500
): Promise<void> {
  const existing = await getIndex(key);
  let ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(itemId)) ids.push(itemId);
  if (ids.length > max) ids = ids.slice(-max);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type,
    ids,
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

export function defaultSmsConfig(tenantId: string): SmsTenantConfig {
  const now = new Date().toISOString();
  return {
    id: configKey(tenantId),
    tenant_id: tenantId,
    type: 'sms_tenant_config',
    enabled: false,
    businessName: '',
    signature: 'Reply STOP to opt out',
    appendOptOutNotice: true,
    quietHoursEnabled: true,
    quietHoursStart: '21:00',
    quietHoursEnd: '08:00',
    defaultTimezone: 'America/New_York',
    defaultCountry: 'US',
    allowColdOutreach: false,
    requireConsent: true,
    dailySendLimit: 200,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getSmsConfig(tenantId: string): Promise<SmsTenantConfig> {
  try {
    const item = await getItem<SmsTenantConfig>(tableNames.profiles, {
      id: configKey(tenantId),
    });
    if (item && item.tenant_id === tenantId) return item;
  } catch {
    /* fall through */
  }
  return defaultSmsConfig(tenantId);
}

export async function findSmsTenantByOriginationIdentity(
  originationIdentity: string
): Promise<string | null> {
  const matches = await scanItems<SmsTenantConfig>(
    tableNames.profiles,
    '#type = :type AND originationIdentity = :identity',
    { ':type': 'sms_tenant_config', ':identity': originationIdentity },
    { '#type': 'type' }
  );
  return matches.find((item) => item.enabled)?.tenant_id || matches[0]?.tenant_id || null;
}

export async function getSmsConversationRoute(
  destinationNumber: string,
  phoneE164: string
): Promise<SmsConversationRoute | null> {
  try {
    return await getItem<SmsConversationRoute>(tableNames.profiles, {
      id: conversationRouteKey(destinationNumber, phoneE164),
    });
  } catch {
    return null;
  }
}

export async function getSmsConversationRouteByProviderMessageId(
  providerMessageId: string
): Promise<SmsConversationRoute | null> {
  try {
    const providerRoute = await getItem<SmsProviderRoute>(tableNames.profiles, {
      id: providerRouteKey(providerMessageId),
    });
    if (!providerRoute?.conversationKey) return null;
    return await getItem<SmsConversationRoute>(tableNames.profiles, {
      id: providerRoute.conversationKey,
    });
  } catch {
    return null;
  }
}

export async function resolveSmsConversationRoute(input: {
  destinationNumber?: string;
  phoneE164: string;
  previousProviderMessageId?: string;
}): Promise<SmsConversationRoute | null> {
  if (input.previousProviderMessageId) {
    const byMessage = await getSmsConversationRouteByProviderMessageId(
      input.previousProviderMessageId
    );
    if (byMessage) return byMessage;
  }
  if (!input.destinationNumber) return null;
  return getSmsConversationRoute(input.destinationNumber, input.phoneE164);
}

export async function upsertSmsConversationRoute(input: {
  tenantId: string;
  destinationNumber: string;
  phoneE164: string;
  candidateId?: string;
  candidateName?: string;
  contactId?: string;
  contactName?: string;
  companyId?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  providerMessageId?: string;
}): Promise<SmsConversationRoute> {
  const id = conversationRouteKey(input.destinationNumber, input.phoneE164);
  const existing = await getItem<SmsConversationRoute>(tableNames.profiles, { id });
  if (existing && existing.tenant_id !== input.tenantId) {
    throw new Error('SMS conversation number pair belongs to another tenant');
  }
  const now = new Date().toISOString();
  const route: SmsConversationRoute = {
    id,
    tenant_id: input.tenantId,
    type: 'sms_conversation_route',
    destinationNumber: input.destinationNumber,
    phoneE164: input.phoneE164,
    candidateId: input.candidateId || existing?.candidateId,
    candidateName: input.candidateName || existing?.candidateName,
    contactId: input.contactId || existing?.contactId,
    contactName: input.contactName || existing?.contactName,
    companyId: input.companyId || existing?.companyId,
    // An explicit manager reassignment remains sticky when another user replies.
    ownerUserId: existing?.ownerUserId || input.ownerUserId,
    ownerName: existing?.ownerName || input.ownerName,
    ownerEmail: existing?.ownerEmail || input.ownerEmail,
    lastProviderMessageId:
      input.providerMessageId || existing?.lastProviderMessageId,
    unreadCount: existing?.unreadCount || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, route);
  if (input.providerMessageId) {
    await putItem(tableNames.profiles, {
      id: providerRouteKey(input.providerMessageId),
      tenant_id: input.tenantId,
      type: 'sms_provider_route',
      conversationKey: route.id,
      createdAt: now,
    } satisfies SmsProviderRoute);
  }
  return route;
}

export async function listSmsConversationRoutes(
  tenantId: string
): Promise<SmsConversationRoute[]> {
  return scanItems<SmsConversationRoute>(
    tableNames.profiles,
    '#type = :type AND tenant_id = :tenantId',
    { ':type': 'sms_conversation_route', ':tenantId': tenantId },
    { '#type': 'type' }
  );
}

export async function assignSmsConversationRoute(input: {
  tenantId: string;
  conversationKey: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
}): Promise<SmsConversationRoute | null> {
  const existing = await getItem<SmsConversationRoute>(tableNames.profiles, {
    id: input.conversationKey,
  });
  if (!existing || existing.tenant_id !== input.tenantId) return null;
  const next: SmsConversationRoute = {
    ...existing,
    ownerUserId: input.ownerUserId,
    ownerName: input.ownerName,
    ownerEmail: input.ownerEmail,
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, next);
  return next;
}

export async function incrementSmsConversationUnread(
  conversationKey: string
): Promise<void> {
  const existing = await getItem<SmsConversationRoute>(tableNames.profiles, {
    id: conversationKey,
  });
  if (!existing) return;
  await putItem(tableNames.profiles, {
    ...existing,
    unreadCount: (existing.unreadCount || 0) + 1,
    updatedAt: new Date().toISOString(),
  });
}

export async function markSmsConversationRead(input: {
  tenantId: string;
  conversationKey: string;
  userId: string;
  canReadAll: boolean;
}): Promise<boolean> {
  const existing = await getItem<SmsConversationRoute>(tableNames.profiles, {
    id: input.conversationKey,
  });
  if (
    !existing ||
    existing.tenant_id !== input.tenantId ||
    (existing.ownerUserId
      ? existing.ownerUserId !== input.userId
      : !input.canReadAll)
  ) {
    return false;
  }
  await putItem(tableNames.profiles, {
    ...existing,
    unreadCount: 0,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

export async function updateSmsConfig(
  tenantId: string,
  input: UpdateSmsConfigInput,
  updatedBy?: string
): Promise<SmsTenantConfig> {
  const existing = await getSmsConfig(tenantId);
  const now = new Date().toISOString();
  const next: SmsTenantConfig = {
    ...existing,
    ...input,
    id: configKey(tenantId),
    tenant_id: tenantId,
    type: 'sms_tenant_config',
    updatedAt: now,
    createdAt: existing.createdAt || now,
    updatedBy,
  };
  await putItem(tableNames.profiles, next);
  return next;
}

export async function getConsent(
  tenantId: string,
  phoneE164: string
): Promise<SmsConsentRecord | null> {
  try {
    const item = await getItem<SmsConsentRecord>(tableNames.profiles, {
      id: consentKey(tenantId, phoneE164),
    });
    if (!item || item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function upsertConsent(params: {
  tenantId: string;
  phoneE164: string;
  status: 'opted_in' | 'opted_out' | 'unknown';
  source: SmsConsentSource;
  candidateId?: string;
  contactId?: string;
  companyId?: string;
  notes?: string;
  lastKeyword?: string;
}): Promise<SmsConsentRecord> {
  const existing = await getConsent(params.tenantId, params.phoneE164);
  const now = new Date().toISOString();
  const record: SmsConsentRecord = {
    id: consentKey(params.tenantId, params.phoneE164),
    tenant_id: params.tenantId,
    type: 'sms_consent',
    phoneE164: params.phoneE164,
    candidateId: params.candidateId || existing?.candidateId,
    contactId: params.contactId || existing?.contactId,
    companyId: params.companyId || existing?.companyId,
    status: params.status,
    source: params.source,
    optedInAt:
      params.status === 'opted_in'
        ? now
        : existing?.optedInAt,
    optedOutAt:
      params.status === 'opted_out'
        ? now
        : params.status === 'opted_in'
          ? undefined
          : existing?.optedOutAt,
    lastKeyword: params.lastKeyword || existing?.lastKeyword,
    notes: params.notes ?? existing?.notes,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, record);
  return record;
}

export async function saveSmsMessage(
  tenantId: string,
  msg: Omit<SmsMessage, 'id' | 'tenant_id' | 'type' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Promise<SmsMessage> {
  const shortId = msg.id || generateId();
  const now = new Date().toISOString();
  const id = messageKey(tenantId, shortId);
  const record: SmsMessage = {
    ...msg,
    id,
    tenant_id: tenantId,
    type: 'sms_message',
    createdAt: now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, record);
  await addToIndex(msgIndexKey(tenantId), tenantId, 'sms_msg_index', id);
  if (msg.candidateId) {
    await addToIndex(
      candMsgIndexKey(tenantId, msg.candidateId),
      tenantId,
      'sms_cand_msg_index',
      id,
      200
    );
  }
  if (msg.contactId) {
    await addToIndex(
      contactMsgIndexKey(tenantId, msg.contactId),
      tenantId,
      'sms_contact_msg_index',
      id,
      200
    );
  }
  return record;
}

async function listMessagesFromIndex(
  tenantId: string,
  indexId: string
): Promise<SmsMessage[]> {
  const idx = await getIndex(indexId);
  if (!idx?.ids?.length) return [];
  const out: SmsMessage[] = [];
  for (const id of idx.ids) {
    try {
      const m = await getItem<SmsMessage>(tableNames.profiles, { id });
      if (m && m.tenant_id === tenantId) out.push(m);
    } catch {
      /* skip */
    }
  }
  return out.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function listMessagesForCandidate(
  tenantId: string,
  candidateId: string
): Promise<SmsMessage[]> {
  return listMessagesFromIndex(
    tenantId,
    candMsgIndexKey(tenantId, candidateId)
  );
}

export async function listMessagesForContact(
  tenantId: string,
  contactId: string
): Promise<SmsMessage[]> {
  return listMessagesFromIndex(
    tenantId,
    contactMsgIndexKey(tenantId, contactId)
  );
}

export async function listRecentMessages(
  tenantId: string,
  limit = 50
): Promise<SmsMessage[]> {
  const idx = await getIndex(msgIndexKey(tenantId));
  if (!idx?.ids?.length) return [];
  const ids = idx.ids.slice(-limit).reverse();
  const out: SmsMessage[] = [];
  for (const id of ids) {
    try {
      const m = await getItem<SmsMessage>(tableNames.profiles, { id });
      if (m && m.tenant_id === tenantId) out.push(m);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function getDailySendCount(tenantId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const item = await getItem<{ count: number }>(tableNames.profiles, {
      id: dailyCountKey(tenantId, day),
    });
    return item?.count || 0;
  } catch {
    return 0;
  }
}

export async function incrementDailySendCount(
  tenantId: string,
  by = 1
): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = dailyCountKey(tenantId, day);
  let count = 0;
  try {
    const item = await getItem<{ count: number }>(tableNames.profiles, { id: key });
    count = item?.count || 0;
  } catch {
    count = 0;
  }
  count += by;
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'sms_daily_count',
    day,
    count,
    updatedAt: new Date().toISOString(),
  });
  return count;
}
