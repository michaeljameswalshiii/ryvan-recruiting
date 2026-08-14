/**
 * Client Repository
 * Loads companies and manages nested contacts[] (multi-phone structure).
 *
 * @serverOnly
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Contact, ContactPhone, CreateClientInput, UpdateClientInput } from '../../schemas/client';
import { assignDefaultOwnerOnCreate } from '@/lib/ownership/default-owner';

export type ClientRecord = {
  id?: string;
  tenant_id?: string;
  name?: string;
  companyName?: string;
  contacts?: Contact[];
  primaryContactId?: string;
  modified_at?: string;
  [key: string]: any;
};

const TABLE_NAME = process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients';

function getDocClient() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;

  const client = new DynamoDBClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
  });
}

function generateId(): string {
  return (
    crypto.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function extractPreferredPhone(phones?: ContactPhone[]): {
  preferredPhone: string;
  preferredPhoneType: string;
} {
  if (!phones || phones.length === 0) {
    return { preferredPhone: '', preferredPhoneType: '' };
  }
  const preferred = phones.find((p) => p.isPreferred === true);
  if (preferred?.number) {
    return {
      preferredPhone: preferred.number,
      preferredPhoneType: preferred.type || '',
    };
  }
  const first = phones[0];
  if (first?.number) {
    return {
      preferredPhone: first.number,
      preferredPhoneType: first.type || '',
    };
  }
  return { preferredPhone: '', preferredPhoneType: '' };
}

function removeUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => removeUndefinedDeep(v))
      .filter((v) => v !== undefined) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = removeUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

function tenantsToTry(tenantId: string): string[] {
  const list = [tenantId];
  if (tenantId.startsWith('tenant-')) {
    const bare = tenantId.replace(/^tenant-/, '');
    if (bare && !list.includes(bare)) list.push(bare);
  } else if (!list.includes(`tenant-${tenantId}`)) {
    list.push(`tenant-${tenantId}`);
  }
  if (!list.includes('default')) list.push('default');
  return [...new Set(list.filter(Boolean))];
}

export async function getAllClients(tenantId: string): Promise<ClientRecord[]> {
  try {
    console.log(`[getAllClients] Fetching for tenant: ${tenantId}`);
    const doc = getDocClient();
    const result = await doc.send(new ScanCommand({ TableName: TABLE_NAME }));
    const items = (result.Items || []) as ClientRecord[];
    const companies = items.filter((item) => {
      if (!item) return false;
      if (item.tenant_id) return tenantsToTry(tenantId).includes(item.tenant_id);
      return true;
    });
    console.log(`[getAllClients] Loaded ${companies.length} companies`);
    return companies;
  } catch (error: any) {
    console.error('[getAllClients] Error:', error);
    return [];
  }
}

export async function getClientById(
  tenantId: string,
  clientId: string
): Promise<ClientRecord | null> {
  const doc = getDocClient();

  for (const t of tenantsToTry(tenantId)) {
    try {
      const res = await doc.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { tenant_id: t, id: clientId },
        })
      );
      if (res.Item) return res.Item as ClientRecord;
    } catch (err) {
      console.warn('[getClientById] get failed for tenant', t, err);
    }
  }

  const all = await getAllClients(tenantId);
  return (
    all.find(
      (c) => String(c.id) === String(clientId) || String((c as any).PK) === String(clientId)
    ) || null
  );
}

/**
 * Create a new client/company record
 */
export async function createClient(
  tenantId: string,
  data: CreateClientInput | Record<string, any>,
  actor?: { userId: string; email?: string | null },
): Promise<ClientRecord> {
  const doc = getDocClient();
  const now = new Date().toISOString();
  const id =
    (typeof data.id === 'string' && data.id) ||
    generateId();

  const item = removeUndefinedDeep({
    ...data,
    id,
    tenant_id: tenantId,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    status: data.status || 'identification',
    created_at: now,
    updated_at: now,
    modified_at: now,
  }) as ClientRecord;

  if (!item.name) {
    throw new Error('Company name is required');
  }

  // Avoid empty-string GSI keys
  if (item.email === '') delete item.email;
  if ((item as any).fee_percent == null) delete (item as any).fee_percent;
  if ((item as any).fee_type === '') delete (item as any).fee_type;
  if ((item as any).fee_guarantee === '') delete (item as any).fee_guarantee;

  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  if (actor?.userId && item.id) {
    await assignDefaultOwnerOnCreate({
      tenantId,
      objectType: 'company',
      objectId: String(item.id),
      actorUserId: actor.userId,
      actorEmail: actor.email,
    });
  }

  return item;
}

/**
 * Update an existing client/company (partial patch)
 */
export async function updateClient(
  tenantId: string,
  clientId: string,
  updates: UpdateClientInput | Record<string, any>
): Promise<ClientRecord | null> {
  const existing = await getClientById(tenantId, clientId);
  if (!existing || !existing.id) return null;

  const resolvedTenant = existing.tenant_id || tenantId;
  const now = new Date().toISOString();

  // Never overwrite primary keys with empty/undefined from partials
  const { id: _id, tenant_id: _tid, ...safeUpdates } = updates as Record<string, any>;
  const merged = removeUndefinedDeep({
    ...existing,
    ...safeUpdates,
    id: existing.id,
    tenant_id: resolvedTenant,
    updated_at: now,
    modified_at: now,
  }) as ClientRecord;

  if (merged.email === '') delete merged.email;
  if (safeUpdates.fee_percent === null) {
    delete (merged as any).fee_percent;
    delete (merged as any).feePercent;
  }
  if (safeUpdates.fee_type === '') delete (merged as any).fee_type;
  if (safeUpdates.fee_guarantee === '') delete (merged as any).fee_guarantee;

  const doc = getDocClient();
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: merged,
    })
  );

  return merged;
}

/**
 * Delete a client/company
 */
export async function deleteClient(
  tenantId: string,
  clientId: string
): Promise<boolean> {
  const existing = await getClientById(tenantId, clientId);
  if (!existing || !existing.id) return false;

  const doc = getDocClient();
  const resolvedTenant = existing.tenant_id || tenantId;

  await doc.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { tenant_id: resolvedTenant, id: existing.id },
    })
  );

  return true;
}

/**
 * Get the primary contact for a company (embedded contacts model)
 */
export async function getPrimaryContact(
  tenantId: string,
  clientId: string
): Promise<Contact | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client?.contacts?.length) return null;
  if (client.primaryContactId) {
    const byId = client.contacts.find((c) => c.id === client.primaryContactId);
    if (byId) return byId;
  }
  return client.contacts.find((c) => c.isPrimary) || client.contacts[0] || null;
}

/**
 * Mark a contact as primary on a company
 */
export async function setPrimaryContact(
  tenantId: string,
  clientId: string,
  contactId: string
): Promise<ClientRecord | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client || !client.id) return null;

  const now = new Date().toISOString();
  const contacts = (client.contacts || []).map((c) => ({
    ...c,
    isPrimary: c.id === contactId,
    updatedAt: now,
  }));

  return persistContacts(
    client.tenant_id || tenantId,
    client.id,
    contacts,
    contactId
  );
}

async function persistContacts(
  tenantId: string,
  clientId: string,
  contacts: Contact[],
  primaryContactId?: string | null
): Promise<ClientRecord> {
  const now = new Date().toISOString();
  const sanitized = removeUndefinedDeep(contacts);
  const doc = getDocClient();

  const tryUpdate = async (t: string, id: string) => {
    const res = await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { tenant_id: t, id },
        UpdateExpression:
          'SET #contacts = :contacts, #primaryContactId = :primaryContactId, #modified_at = :modified_at',
        ExpressionAttributeNames: {
          '#contacts': 'contacts',
          '#primaryContactId': 'primaryContactId',
          '#modified_at': 'modified_at',
        },
        ExpressionAttributeValues: {
          ':contacts': sanitized,
          ':primaryContactId': primaryContactId ?? null,
          ':modified_at': now,
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    return res.Attributes as ClientRecord;
  };

  for (const t of tenantsToTry(tenantId)) {
    try {
      const updated = await tryUpdate(t, clientId);
      if (updated) return updated;
    } catch (err: any) {
      console.warn(`[persistContacts] update failed tenant=${t}:`, err?.message || err);
    }
  }

  const found = await getClientById(tenantId, clientId);
  if (found?.tenant_id && found.id) {
    return tryUpdate(found.tenant_id, found.id);
  }

  throw new Error(`Could not update contacts for client ${clientId}`);
}

function normalizeIncomingPhones(contact: any): {
  phones?: ContactPhone[];
  phone?: string;
  preferredPhone?: string;
  preferredPhoneType?: string;
} {
  let phones: ContactPhone[] | undefined = Array.isArray(contact?.phones)
    ? contact.phones
        .filter((p: any) => p && typeof p.number === 'string' && p.number.trim() !== '')
        .map((p: any) => ({
          id: typeof p.id === 'string' && p.id ? p.id : generateId(),
          type: typeof p.type === 'string' && p.type ? p.type : 'work',
          number: String(p.number).trim(),
          isPreferred: !!p.isPreferred,
        }))
    : undefined;

  const workPhone = String(
    contact?.workPhone || contact?.work_phone || ''
  ).trim();
  const mobilePhone = String(
    contact?.mobilePhone ||
      contact?.mobile_phone ||
      contact?.cellPhone ||
      contact?.cell_phone ||
      ''
  ).trim();

  if ((!phones || phones.length === 0) && (workPhone || mobilePhone)) {
    phones = [];
    if (workPhone) {
      phones.push({
        id: generateId(),
        type: 'work',
        number: workPhone,
        isPreferred: !mobilePhone,
      });
    }
    if (mobilePhone) {
      phones.push({
        id: generateId(),
        type: 'mobile',
        number: mobilePhone,
        isPreferred: !workPhone,
      });
    }
  }

  if ((!phones || phones.length === 0) && typeof contact?.phone === 'string' && contact.phone.trim()) {
    const raw = contact.phone.trim();
    // Support AI/paste style "work / mobile"
    const parts = raw.split(/\s*[/|;]\s*/).map((p: string) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      phones = [
        { id: generateId(), type: 'work', number: parts[0], isPreferred: true },
        { id: generateId(), type: 'mobile', number: parts[1], isPreferred: false },
      ];
    } else {
      phones = [
        {
          id: generateId(),
          type: 'work',
          number: raw,
          isPreferred: true,
        },
      ];
    }
  }

  if (phones && phones.length > 0 && !phones.some((p) => p.isPreferred)) {
    phones = phones.map((p, i) => ({ ...p, isPreferred: i === 0 }));
  }

  const preferredData = extractPreferredPhone(phones);
  return {
    phones,
    phone: preferredData.preferredPhone || undefined,
    preferredPhone: preferredData.preferredPhone || undefined,
    preferredPhoneType: preferredData.preferredPhoneType || undefined,
  };
}

export async function addContactToClient(
  tenantId: string,
  clientId: string,
  contact: any,
  actor?: { userId: string; email?: string | null },
): Promise<ClientRecord> {
  console.log('[addContactToClient] Input:', { tenantId, clientId, contact });

  const client = await getClientById(tenantId, clientId);
  if (!client || !client.id) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const phoneFields = normalizeIncomingPhones(contact);
  const now = new Date().toISOString();
  const newContact = removeUndefinedDeep({
    id: typeof contact?.id === 'string' && contact.id ? contact.id : generateId(),
    companyId: client.id,
    name: typeof contact?.name === 'string' ? contact.name.trim() : '',
    title: typeof contact?.title === 'string' ? contact.title.trim() : '',
    email:
      typeof contact?.email === 'string' && contact.email.trim() !== ''
        ? contact.email.trim().toLowerCase()
        : '',
    isPrimary: !!contact?.isPrimary,
    notes: typeof contact?.notes === 'string' ? contact.notes : '',
    createdAt: now,
    updatedAt: now,
    ...phoneFields,
  }) as Contact;

  if (!newContact.name) {
    throw new Error('Contact name is required');
  }

  let contacts = [...(client.contacts || [])];
  let primaryContactId = client.primaryContactId;

  if (newContact.isPrimary) {
    contacts = contacts.map((c) => ({ ...c, isPrimary: false, updatedAt: now }));
    primaryContactId = newContact.id;
  }

  contacts.push(newContact);

  const updated = await persistContacts(
    client.tenant_id || tenantId,
    client.id,
    contacts,
    primaryContactId
  );
  console.log('[addContactToClient] Success');

  if (actor?.userId && newContact.id) {
    await assignDefaultOwnerOnCreate({
      tenantId,
      objectType: 'contact',
      objectId: String(newContact.id),
      actorUserId: actor.userId,
      actorEmail: actor.email,
    });
  }

  return updated;
}

export async function updateClientContact(
  tenantId: string,
  clientId: string,
  contactId: string,
  data: Partial<Contact>
): Promise<ClientRecord | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client || !client.id) return null;

  const now = new Date().toISOString();
  let contacts = [...(client.contacts || [])];
  let primaryContactId = client.primaryContactId;
  const idx = contactId ? contacts.findIndex((c) => c.id === contactId) : -1;
  const phoneFields = normalizeIncomingPhones({
    phone: (data as any).phone,
    phones: (data as any).phones,
  });

  if (idx === -1) {
    if (data.isPrimary) {
      contacts = contacts.map((c) => ({ ...c, isPrimary: false, updatedAt: now }));
    }
    const newId = (data as any).id || generateId();
    contacts.push(
      removeUndefinedDeep({
        ...data,
        id: newId,
        companyId: client.id,
        ...phoneFields,
        createdAt: now,
        updatedAt: now,
      }) as Contact
    );
    if (data.isPrimary) primaryContactId = newId;
  } else {
    if (data.isPrimary === true) {
      contacts = contacts.map((c, i) =>
        i === idx ? c : c.isPrimary ? { ...c, isPrimary: false, updatedAt: now } : c
      );
      primaryContactId = contactId;
    } else if (data.isPrimary === false && client.primaryContactId === contactId) {
      primaryContactId = contacts.find((c) => c.isPrimary && c.id !== contactId)?.id;
    }

    const preferred =
      phoneFields.preferredPhone !== undefined
        ? phoneFields
        : extractPreferredPhone(
            ((data as any).phones as ContactPhone[] | undefined) || contacts[idx].phones
          );

    contacts[idx] = removeUndefinedDeep({
      ...contacts[idx],
      ...data,
      ...preferred,
      phones: phoneFields.phones || contacts[idx].phones,
      phone: preferred.preferredPhone || (data as any).phone || contacts[idx].phone || '',
      updatedAt: now,
    }) as Contact;
  }

  return persistContacts(client.tenant_id || tenantId, client.id, contacts, primaryContactId);
}

export async function removeClientContact(
  tenantId: string,
  clientId: string,
  contactId: string
): Promise<ClientRecord | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client || !client.id) return null;

  const contacts = (client.contacts || []).filter((c) => c.id !== contactId);
  let primaryContactId = client.primaryContactId;
  if (primaryContactId === contactId) {
    primaryContactId = contacts.find((c) => c.isPrimary)?.id || contacts[0]?.id;
  }

  return persistContacts(client.tenant_id || tenantId, client.id, contacts, primaryContactId);
}
