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

  // Query contacts for this tenant using begins_with on SK
  const contacts = await queryItems<Contact>(
    clientsTable,
    'tenant_id = :tenantId AND begins_with(SK, :contactPrefix)',
    { 
      ':tenantId': tenantId,
      ':contactPrefix': `CONTACT#`
    }
  );

  // Filter by companyId (since we're storing companyId on each contact)
  const filteredContacts = (contacts as CompanyContact[]).filter(c => c.companyId === companyId);

  // Cache the result
  await setCached(cacheKey, filteredContacts, CACHE_TTL);

  return filteredContacts;
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
  const contact = await getItem<Contact>(clientsTable, {
    tenant_id: tenantId,
    SK: `CONTACT#${contactId}`,
  });

  // Verify it belongs to the company
  if (contact && contact.companyId === companyId) {
    return contact;
  }

  return null;
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
 * Add note to contact - Simple and Reliable
 */
import { getAllClients, updateClient } from './client-repository';

export async function addNoteToContact(contactId: string, note: any) {
  try {
    const allClients = await getAllClients();

    for (const client of allClients) {
      const contactIndex = client.contacts?.findIndex((c: any) => c.id === contactId);
      
      if (contactIndex !== -1) {
        const contact = client.contacts[contactIndex];
        const notes = contact.notes || [];

        notes.push({
          id: `note_${Date.now()}`,
          type: note.type,
          content: note.content,
          createdAt: new Date().toISOString(),
          createdBy: note.createdBy || "current-user",
        });

        // Update the contact
        client.contacts[contactIndex] = {
          ...contact,
          notes,
          updatedAt: new Date().toISOString()
        };

        await updateClient(client.id, {
          contacts: client.contacts,
          updatedAt: new Date().toISOString()
        });

        console.log(`✅ Successfully added note to contact ${contactId}`);
        return { success: true };
      }
    }

    throw new Error(`Contact ${contactId} not found`);
  } catch (error: any) {
    console.error('❌ addNoteToContact failed:', error);
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
