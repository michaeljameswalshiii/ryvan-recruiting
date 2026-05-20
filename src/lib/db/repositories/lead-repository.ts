/**
 * Lead Repository
 * Server-only data access layer for leads
 * 
 * @serverOnly
 */

import {
  getItem,
  queryItems,
  putItem,
  deleteItem,
  updateItem,
  leadsTable,
} from '../dynamodb';
import { getCached, setCached, invalidateTenantCache, makeCacheKey } from '../../cache';
import { type Lead, type CreateLeadInput, type UpdateLeadInput } from '../../schemas/lead';

// Cache TTL: 5 minutes
const CACHE_TTL = 300;

// Pipeline stages that show in the UI pipeline
// Also include legacy statuses for backward compatibility with migrated data
export const PIPELINE_STAGES = [
  'identification',
  'outreach',
  'conversation',
  'presented',
  'interview',
  'accept',
  'rejected',
  'new',         // Legacy - new lead not yet contacted
  'converted',   // Legacy - lead converted to client
];

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
 * Get all leads for a tenant
 */
export async function getAllLeads(tenantId: string): Promise<Lead[]> {
  const cacheKey = makeCacheKey(tenantId, 'leads', 'all');
  
  // Try cache first
  const cached = await getCached<Lead[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Query from DynamoDB
  const leads = await queryItems<Lead>(
    leadsTable,
    'tenant_id = :tenantId',
    { ':tenantId': tenantId }
  );
  
  // Cache the result
  await setCached(cacheKey, leads, CACHE_TTL);
  
  return leads;
}

/**
 * Get leads by status
 */
export async function getLeadsByStatus(tenantId: string, status: string): Promise<Lead[]> {
  return queryItems<Lead>(
    leadsTable,
    'tenant_id = :tenantId AND #status = :status',
    { ':tenantId': tenantId, ':status': status },
    { '#status': 'status' }
  );
}

/**
 * Get leads NOT in pipeline stages (these need to be migrated to identification)
 */
export async function getLeadsNotInPipeline(tenantId: string): Promise<Lead[]> {
  const allLeads = await getAllLeads(tenantId);
  return allLeads.filter(lead => !PIPELINE_STAGES.includes(lead.status || ''));
}

/**
 * Get a single lead by ID
 */
export async function getLeadById(tenantId: string, leadId: string): Promise<Lead | null> {
  const cacheKey = makeCacheKey(tenantId, 'leads', leadId);
  
  // Try cache first
  const cached = await getCached<Lead>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get from DynamoDB
  const lead = await getItem<Lead>(leadsTable, {
    tenant_id: tenantId,
    id: leadId,
  });
  
  if (lead) {
    await setCached(cacheKey, lead, CACHE_TTL);
  }
  
  return lead;
}

/**
 * Create a new lead
 */
export async function createLead(tenantId: string, data: CreateLeadInput): Promise<Lead> {
  const validated = data;
  
  const lead: Lead = {
    id: generateId(),
    tenant_id: tenantId,
    name: validated.name,
email: validated.email || '',
    phone: validated.phone || '',
    company: validated.company || '',
    title: validated.title || '',
    status: validated.status || 'identification',
    source: validated.source || '',
    notes: validated.notes || '',
    linkedin_url: validated.linkedin_url || '',
    created_at: new Date().toISOString(),
  };
  
  // Save to DynamoDB
  await putItem(leadsTable, lead);
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return lead;
}

/**
 * Update a lead
 */
export async function updateLead(
  tenantId: string,
  leadId: string,
  data: UpdateLeadInput
): Promise<Lead | null> {
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  
  if (data.name !== undefined) {
    updates.push('#name = :name');
    values[':name'] = data.name;
    names['#name'] = 'name';
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
  if (data.company !== undefined) {
    updates.push('#company = :company');
    values[':company'] = data.company;
    names['#company'] = 'company';
  }
  if (data.title !== undefined) {
    updates.push('#title = :title');
    values[':title'] = data.title;
    names['#title'] = 'title';
  }
  if (data.status !== undefined) {
    updates.push('#status = :status');
    values[':status'] = data.status;
    names['#status'] = 'status';
  }
  if (data.source !== undefined) {
    updates.push('#source = :source');
    values[':source'] = data.source;
    names['#source'] = 'source';
  }
  if (data.notes !== undefined) {
    updates.push('#notes = :notes');
    values[':notes'] = data.notes;
    names['#notes'] = 'notes';
  }
  if (data.linkedin_url !== undefined) {
    updates.push('#linkedin_url = :linkedin_url');
    values[':linkedin_url'] = data.linkedin_url;
    names['#linkedin_url'] = 'linkedin_url';
  }
  
  if (updates.length === 0) {
    return getLeadById(tenantId, leadId);
  }
  
  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';
  
  const updated = await updateItem<Lead>(
    leadsTable,
    { tenant_id: tenantId, id: leadId },
    `SET ${updates.join(', ')}`,
    values,
    names
  );
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return updated;
}

/**
 * Update multiple leads in batch - for migration purposes
 */
export async function updateLeadsToIdentification(
  tenantId: string,
  leadIds: string[]
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];
  
  for (const leadId of leadIds) {
    try {
      const result = await updateLead(tenantId, leadId, { status: 'identification' });
      if (result) {
        updated++;
      } else {
        errors.push(`Lead ${leadId} not found`);
      }
    } catch (error: any) {
      errors.push(`Lead ${leadId}: ${error.message}`);
    }
  }
  
  return { updated, errors };
}

/**
 * Delete a lead
 */
export async function deleteLead(tenantId: string, leadId: string): Promise<void> {
  await deleteItem(leadsTable, { tenant_id: tenantId, id: leadId });
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
}

/**
 * Get a lead by email (for duplicate detection)
 * Uses GSI if available, otherwise scans
 */
export async function getLeadByEmail(tenantId: string, email: string): Promise<Lead | null> {
  if (!email) return null;
  
  const normalizedEmail = email.toLowerCase().trim();
  
  // Try to use GSI first (EmailIndex)
  try {
    const leads = await queryItems<Lead>(
      leadsTable,
      'tenant_id = :tenantId AND email = :email',
      { ':tenantId': tenantId, ':email': normalizedEmail }
    );
    if (leads.length > 0) {
      return leads[0];
    }
  } catch {
    // GSI might not exist, fall back to scan
  }
  
  // Fallback: scan all leads for this tenant (not ideal but works)
  const allLeads = await getAllLeads(tenantId);
  return allLeads.find(lead => 
    lead.email?.toLowerCase() === normalizedEmail
  ) || null;
}

/**
 * Get a lead by LinkedIn URL (for duplicate detection)
 */
export async function getLeadByLinkedIn(tenantId: string, linkedinUrl: string): Promise<Lead | null> {
  if (!linkedinUrl) return null;
  
  const normalizedUrl = linkedinUrl.toLowerCase().trim();
  
  // Scan leads for matching LinkedIn
  const allLeads = await getAllLeads(tenantId);
  return allLeads.find(lead => 
    lead.linkedin_url?.toLowerCase().includes(normalizedUrl) || 
    normalizedUrl.includes(lead.linkedin_url?.toLowerCase() || '')
  ) || null;
}
