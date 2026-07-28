/**
 * SMS repository — config, consent, messages in profiles table.
 *
 * @serverOnly
 */

import { getItem, putItem, tableNames } from '../dynamodb';
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
  return record;
}

export async function listMessagesForCandidate(
  tenantId: string,
  candidateId: string
): Promise<SmsMessage[]> {
  const idx = await getIndex(candMsgIndexKey(tenantId, candidateId));
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
