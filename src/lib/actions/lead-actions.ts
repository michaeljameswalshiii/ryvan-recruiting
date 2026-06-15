/**
 * Lead Server Actions
 * Server-side CRUD operations for leads using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { getAllLeads, getAllLeadsWithLinkedJobs, createLead as createLeadRepo, updateLead, deleteLead } from '../db/repositories/lead-repository';
import { createLeadSchema, updateLeadSchema } from '../schemas/lead';
import { recordStatusChange } from '../events/candidate-events';
import { z } from 'zod';

/**
 * Get all leads for the current tenant
 */
export async function getLeads() {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  // If no tenantId but user is logged in, use default tenant
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }

  if (!tenantId) {
    // Not logged in - return empty array (not an error)
    return { leads: [] };
  }

try {
    // Use enriched leads with linkedJobs data for the candidates page
    const leads = await getAllLeadsWithLinkedJobs(tenantId);
    return { leads };
  } catch (error: any) {
    return { error: error.message || 'Failed to get leads' };
  }
}

/**
 * Create a new lead
 */
export async function createLead(formData: FormData) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!userId) {
    return { error: 'Unauthorized' };
  }

  // If no tenantId but user is logged in, create/use default tenant
  if (!tenantId) {
    tenantId = `tenant-${userId}`;
  }

const rawData = {
    name: formData.get('name') as string,
    email: formData.get('email') as string || undefined,
    phone: formData.get('phone') as string || undefined,
    company: formData.get('company') as string || undefined,
    title: formData.get('title') as string || undefined,
    status: formData.get('status') as string || undefined,
    source: formData.get('source') as string || undefined,
    notes: formData.get('notes') as string || undefined,
    linkedin_url: formData.get('linkedin_url') as string || undefined,
  };

  // Log for debugging
  console.log('[createLead] Raw data:', rawData);

  const validated = createLeadSchema.safeParse(rawData);
  
  if (!validated.success) {
    console.error('[createLead] Validation failed:', validated.error.flatten().fieldErrors);
    return {
      error: 'Invalid input: ' + JSON.stringify(validated.error.flatten().fieldErrors),
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const lead = await createLeadRepo(tenantId, validated.data);
    return { success: true, lead };
  } catch (error: any) {
    return { error: error.message || 'Failed to create lead' };
  }
}

/**
 * Update an existing lead
 */
export async function updateLeadAction(leadId: string, formData: FormData) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  // If no tenantId but user is logged in, use default tenant
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  const rawData = {
    name: formData.get('name') as string || undefined,
    email: formData.get('email') as string || undefined,
    phone: formData.get('phone') as string || undefined,
    company: formData.get('company') as string || undefined,
    title: formData.get('title') as string || undefined,
    status: formData.get('status') as string || undefined,
    source: formData.get('source') as string || undefined,
    notes: formData.get('notes') as string || undefined,
    linkedin_url: formData.get('linkedin_url') as string || undefined,
  };

  const validated = updateLeadSchema.safeParse(rawData);
  
  if (!validated.success) {
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const lead = await updateLead(tenantId, leadId, validated.data);
    return { success: true, lead };
  } catch (error: any) {
    return { error: error.message || 'Failed to update lead' };
  }
}

/**
 * Delete a lead
 */
export async function deleteLeadAction(leadId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    await deleteLead(tenantId, leadId);
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to delete lead' };
  }
}

/**
 * Update lead status and record STATUS_CHANGE event
 * Used by drag-and-drop to move candidates between stages
 */
export async function updateLeadStatus(leadId: string, newStatus: string, oldStatus: string) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!userId) {
    return { error: 'Unauthorized' };
  }

  // If no tenantId but user is logged in, use default tenant
  if (!tenantId) {
    tenantId = `tenant-${userId}`;
  }
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

try {
    // Validate newStatus is a valid enum value
    const validated = updateLeadSchema.safeParse({ status: newStatus });
    
    if (!validated.success) {
      return {
        error: 'Invalid status',
        details: validated.error.flatten().fieldErrors,
      };
    }

    // TypeScript now knows validated.data.status is valid
    await updateLead(tenantId, leadId, { status: validated.data.status });
    
    // Record the status change event
    // Use userId as createdBy since we don't have email access here
    const eventResult = await recordStatusChange(
      leadId,
      oldStatus,
      newStatus,
      userId
    );
    
    if (!eventResult.success) {
      console.error('[updateLeadStatus] Failed to record event:', eventResult.error);
      // Still return success since the status was updated
    }
    
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to update lead status' };
  }
}
