/**
 * Contact Repository
 * Server-only data access layer for Contacts as child entities of Company
 * Uses DynamoDB with composite key pattern: tenant_id + SK=CONTACT#id
 * 
 * @serverOnly
 */

import {
  getItem,
  queryItems,
  putItem,
  deleteItem,
  updateItem,
  clientsTable,
} from '../dynamodb';
import { getCached, setCached, invalidateTenantCache, makeCacheKey } from '../../cache';
import { type Contact, type CreateContactInput, type UpdateContactInput } from '../../schemas/client';

// Extended contact type with company association
export interface CompanyContact extends Contact {
  companyId: string;
}

// Cache TTL: 5 minutes
const CACHE_TTL = 300;

/**
 * Generate a UUID
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * All CONTACT# child rows for a tenant (not filtered by company).
 */
async function queryAllContactChildRows(
  tenantId: string
): Promise<CompanyContact[]> {
  const result = await queryItems<Contact>(
    clientsTable,
    'tenant_id = :tenantId AND begins_with(SK, :contactPrefix)',
    {
      ':tenantId': tenantId,
      ':contactPrefix': `CONTACT#`,
    }
  );
  return (result.items || []) as CompanyContact[];
}

/**
 * Get all contacts for a company
 * Queries using begins_with on SK prefix
 */
export async function getContactsForCompany(
  tenantId: string,
  companyId: string
): Promise<Contact[]> {
  const cacheKey = makeCacheKey(tenantId, 'contacts', companyId);

  // Try cache first
  const cached = await getCached<Contact[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const contacts = await queryAllContactChildRows(tenantId);

  // Filter by companyId (since we're storing companyId on each contact)
  const filteredContacts = contacts.filter(
    (c) =>
      String(c.companyId || (c as { clientId?: string }).clientId || '') ===
      String(companyId)
  );

  // Cache the result
  await setCached(cacheKey, filteredContacts, CACHE_TTL);

  return filteredContacts;
}

export type TenantContactRow = Contact & {
  companyId: string;
  companyName?: string;
  source?: 'child' | 'embedded';
};

/**
 * List every company contact for a tenant (child CONTACT# rows + embedded company.contacts[]).
 * Dedupes by contact id when both models exist.
 */
export async function getAllContactsForTenant(
  tenantId: string
): Promise<TenantContactRow[]> {
  const cacheKey = makeCacheKey(tenantId, 'contacts', 'all');
  const cached = await getCached<TenantContactRow[]>(cacheKey);
  if (cached) return cached;

  const byId = new Map<string, TenantContactRow>();

  // Child-entity model
  const children = await queryAllContactChildRows(tenantId);
  for (const c of children) {
    const companyId = String(
      c.companyId || (c as { clientId?: string }).clientId || ''
    ).trim();
    if (!c.id) continue;
    byId.set(c.id, {
      ...c,
      companyId,
      source: 'child',
    });
  }

  // Embedded contacts on company records (legacy / dual-write)
  try {
    const { getAllClients } = await import('./client-repository');
    const companies = await getAllClients(tenantId);
    for (const co of companies || []) {
      const companyId = String(co.id || '').trim();
      const companyName = String(co.name || '');
      const embedded = Array.isArray(co.contacts) ? co.contacts : [];
      for (const c of embedded) {
        if (!c?.id) continue;
        if (byId.has(c.id)) {
          // Prefer enriching company name
          const prev = byId.get(c.id)!;
          if (!prev.companyName && companyName) {
            byId.set(c.id, { ...prev, companyName, companyId: prev.companyId || companyId });
          }
          continue;
        }
        byId.set(c.id, {
          ...c,
          companyId: String(c.companyId || companyId),
          companyName,
          source: 'embedded',
        });
      }
      // Attach company names to child rows
      for (const [id, row] of byId) {
        if (row.companyId === companyId && !row.companyName) {
          byId.set(id, { ...row, companyName });
        }
      }
    }
  } catch (err) {
    console.warn('[getAllContactsForTenant] company enrich failed', err);
  }

  const list = Array.from(byId.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
  await setCached(cacheKey, list, CACHE_TTL);
  return list;
}

/**
 * Get a single contact by ID
 */
export async function getContactById(
  tenantId: string,
  companyId: string,
  contactId: string
): Promise<Contact | null> {
  // Get from DynamoDB using composite key
  const contact = await getItem<Contact & { clientId?: string; companyId?: string }>(
    clientsTable,
    {
      tenant_id: tenantId,
      SK: `CONTACT#${contactId}`,
    }
  );

  if (!contact) return null;

  // Verify it belongs to the company when both sides have an id.
  // Some older rows store clientId instead of companyId, or omit the field —
  // still return the contact if SK matched under this tenant (SMS / detail).
  const storedCompany = String(
    contact.companyId || contact.clientId || ''
  ).trim();
  const wantCompany = String(companyId || '').trim();
  if (
    wantCompany &&
    storedCompany &&
    storedCompany !== wantCompany
  ) {
    return null;
  }

  return contact as Contact;
}

/**
 * Get primary contact for a company
 */
export async function getPrimaryContact(
  tenantId: string,
  companyId: string
): Promise<Contact | null> {
  const contacts = await getContactsForCompany(tenantId, companyId);
  
  // First try to find explicit primary
  const primary = contacts.find(c => c.isPrimary);
  if (primary) {
    return primary;
  }

  // Fall back to first contact
  return contacts[0] || null;
}

/**
 * Add a contact to a company
 * Creates a separate item with composite key
 */
export async function addContact(
  tenantId: string,
  companyId: string,
  data: CreateContactInput
): Promise<Contact> {
  const now = new Date().toISOString();
  const contactId = generateId();

  // Check if setting as primary
  let isPrimary = data.isPrimary || false;
  
  // If setting as primary, we need to unset other primaries
  if (isPrimary) {
    await clearPrimaryContacts(tenantId, companyId);
  }

  const contact: Contact = {
    id: contactId,
    companyId,
    name: data.name,
    title: data.title || '',
    email: data.email || '',
    phone: data.phone || '',
    isPrimary,
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  };

  // Save to DynamoDB with composite key
  // NOTE: We store company_id on the item for querying, but use SK for the key
  await putItem(clientsTable, {
    ...contact,
    tenant_id: tenantId,
    PK: `COMPANY#${companyId}`,
    SK: `CONTACT#${contactId}`,
  });

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  // Update company's primaryContactId if needed
  if (isPrimary || !(await hasPrimaryContact(tenantId, companyId))) {
    await updateCompanyPrimaryContactId(tenantId, companyId, contactId);
  }

  return contact;
}

/**
 * Update a contact
 */
export async function updateContact(
  tenantId: string,
  companyId: string,
  contactId: string,
  data: UpdateContactInput
): Promise<Contact | null> {
  const contact = await getContactById(tenantId, companyId, contactId);
  
  if (!contact) {
    return null;
  }

  // Handle primary flag change
  if (data.isPrimary === true && !contact.isPrimary) {
    // Setting as primary - clear other primaries
    await clearPrimaryContacts(tenantId, companyId, contactId);
  }

  const now = new Date().toISOString();
  
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  if (data.name !== undefined) {
    updates.push('#name = :name');
    values[':name'] = data.name;
    names['#name'] = 'name';
  }
  if (data.title !== undefined) {
    updates.push('#title = :title');
    values[':title'] = data.title;
    names['#title'] = 'title';
  }
  if (data.email !== undefined) {
    updates.push('#email = :email');
    values[':email'] = data.email;
    names['#email'] = 'email';
  }
  if (data.phone !== undefined) {
    updates.push('#phone = :phone');
    values[':phone'] = data.phone;
    names['#phone'] = 'phone';
  }
  if (data.isPrimary !== undefined) {
    updates.push('#isPrimary = :isPrimary');
    values[':isPrimary'] = data.isPrimary;
    names['#isPrimary'] = 'isPrimary';
  }
  if (data.notes !== undefined) {
    updates.push('#notes = :notes');
    values[':notes'] = data.notes;
    names['#notes'] = 'notes';
  }

  if (updates.length === 0) {
    return contact;
  }

  // Always update modified_at
  updates.push('#updatedAt = :updatedAt');
  values[':updatedAt'] = now;
  names['#updatedAt'] = 'updatedAt';

  const updated = await updateItem<Contact>(
    clientsTable,
    { tenant_id: tenantId, SK: `CONTACT#${contactId}` },
    `SET ${updates.join(', ')}`,
    values,
    names
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  // Update company's primaryContactId if needed
  if (data.isPrimary === true) {
    await updateCompanyPrimaryContactId(tenantId, companyId, contactId);
  } else if (data.isPrimary === false && contact.isPrimary) {
    // Was primary, now not - find new primary
    const newPrimary = await getPrimaryContact(tenantId, companyId);
    if (newPrimary && newPrimary.id !== contactId) {
      await updateCompanyPrimaryContactId(tenantId, companyId, newPrimary.id);
    } else {
      await updateCompanyPrimaryContactId(tenantId, companyId, null);
    }
  }

  return updated;
}

/**
 * Remove a contact from a company
 */
export async function removeContact(
  tenantId: string,
  companyId: string,
  contactId: string
): Promise<void> {
  const contact = await getContactById(tenantId, companyId, contactId);
  
  if (!contact) {
    return;
  }

  // Delete from DynamoDB
  await deleteItem(clientsTable, {
    tenant_id: tenantId,
    SK: `CONTACT#${contactId}`,
  });

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  // Update company's primaryContactId if this was the primary
  if (contact.isPrimary) {
    const newPrimary = await getPrimaryContact(tenantId, companyId);
    if (newPrimary) {
      await updateCompanyPrimaryContactId(tenantId, companyId, newPrimary.id);
    } else {
      await updateCompanyPrimaryContactId(tenantId, companyId, null);
    }
  }
}

/**
 * Set primary contact for a company
 */
export async function setPrimaryContact(
  tenantId: string,
  companyId: string,
  contactId: string
): Promise<Contact | null> {
  return updateContact(tenantId, companyId, contactId, { isPrimary: true });
}

/**
 * Add a note/activity to a contact - RELIABLE DIRECT VERSION
 * Updated to write to direct contact item (and fallback to embedded)
 */
import { getAllClients, updateClient } from './client-repository';
import { getSessionTenantId } from '@/lib/server-auth';

export async function addNoteToContact(contactId: string, note: any) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) throw new Error("No tenantId");

    // Try direct contact item first (preferred path)
    const existingContact = await getItem<any>(clientsTable, {
      tenant_id: tenantId,
      SK: `CONTACT#${contactId}`,
    });

    if (existingContact) {
      const notes = Array.isArray(existingContact.notes) ? [...existingContact.notes] : [];
      const newNote = {
        id: `note_${Date.now()}`,
        type: note.type,
        content: note.content,
        createdAt: new Date().toISOString(),
        createdBy: note.createdBy || "current-user",
      };

      await updateItem(clientsTable, {
        tenant_id: tenantId,
        SK: `CONTACT#${contactId}`,
      }, {
        notes: [...notes, newNote],
        updatedAt: new Date().toISOString(),
      });

      console.log(`✅ Note added directly to CONTACT#${contactId}`);
      return { success: true };
    }

    // Fallback to old embedded path (for backward compat during migration)
    const allClients = await getAllClients(tenantId);

    for (const client of allClients) {
      const contactIndex = client.contacts?.findIndex((c: any) => c.id === contactId);
      if (contactIndex !== -1) {
        const contact = client.contacts[contactIndex];
        const notes = Array.isArray(contact.notes) ? [...contact.notes] : [];

        notes.push({
          id: `note_${Date.now()}`,
          type: note.type,
          content: note.content,
          createdAt: new Date().toISOString(),
          createdBy: note.createdBy || "current-user",
        });

        // Direct update using map for all contacts
        await updateClient(tenantId, client.id, {
          contacts: client.contacts.map((c: any, i: number) => 
            i === contactIndex ? { ...c, notes, updatedAt: new Date().toISOString() } : c
          )
        });

        console.log(`✅ Note saved to embedded contact ${contactId}`);
        return { success: true };
      }
    }

    throw new Error(`Contact not found: ${contactId}`);
  } catch (error: any) {
    console.error('addNoteToContact error:', error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clear primary flag from all contacts for a company (except optionally one)
 */
async function clearPrimaryContacts(
  tenantId: string,
  companyId: string,
  exceptContactId?: string
): Promise<void> {
  const contacts = await getContactsForCompany(tenantId, companyId);
  
  for (const contact of contacts) {
    if (contact.isPrimary && contact.id !== exceptContactId) {
      await updateItem<Contact>(
        clientsTable,
        { tenant_id: tenantId, SK: `CONTACT#${contact.id}` },
        'SET #isPrimary = :isPrimary, #updatedAt = :updatedAt',
        { 
          ':isPrimary': false,
          ':updatedAt': new Date().toISOString()
        },
        {
          '#isPrimary': 'isPrimary',
          '#updatedAt': 'updatedAt',
        }
      );
    }
  }
}

/**
 * Check if company has a primary contact
 */
async function hasPrimaryContact(
  tenantId: string,
  companyId: string
): Promise<boolean> {
  const primary = await getPrimaryContact(tenantId, companyId);
  return !!primary;
}

/**
 * Update company's primaryContactId field
 */
async function updateCompanyPrimaryContactId(
  tenantId: string,
  companyId: string,
  contactId: string | null
): Promise<void> {
  await updateItem<Record<string, unknown>>(
    clientsTable,
    { tenant_id: tenantId, id: companyId },
    'SET #primaryContactId = :primaryContactId, #modified_at = :modified_at',
    {
      ':primaryContactId': contactId,
      ':modified_at': new Date().toISOString(),
    },
    {
      '#primaryContactId': 'primaryContactId',
      '#modified_at': 'modified_at',
    }
  );
}

/**
 * Migrate array contacts to child entities
 * Called by migration script
 */
export async function migrateContacts(
  tenantId: string,
  companyId: string,
  contacts: Contact[]
): Promise<void> {
  const existingContacts = await getContactsForCompany(tenantId, companyId);
  
  // Skip if already migrated
  if (existingContacts.length > 0) {
    console.log(`[CONTACT-REPO] Contacts already migrated for company ${companyId}`);
    return;
  }

  // Migrate each contact
  for (const contact of contacts) {
    await addContact(tenantId, companyId, {
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
      notes: contact.notes,
    });
  }

  console.log(`[CONTACT-REPO] Migrated ${contacts.length} contacts for company ${companyId}`);
}
