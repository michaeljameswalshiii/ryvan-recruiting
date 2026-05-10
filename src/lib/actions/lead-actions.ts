/**
 * Lead Server Actions
 * Server-side CRUD operations for leads using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { getAllLeads, createLead as createLeadRepo, updateLead, deleteLead } from '../db/repositories/lead-repository';
import { createLeadSchema, updateLeadSchema } from '../schemas/lead';
import { z } from 'zod';

/**
 * Get all leads for the current tenant
 */
export async function getLeads() {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const leads = await getAllLeads(tenantId);
    return { leads };
  } catch (error: any) {
    return { error: error.message || 'Failed to get leads' };
  }
}

/**
 * Create a new lead
 */
export async function createLead(formData: FormData) {
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!tenantId || !userId) {
    return { error: 'Unauthorized' };
  }

  const rawData = {
    name: formData.get('name') as string,
    email: formData.get('email') as string || '',
    phone: formData.get('phone') as string || '',
    company: formData.get('company') as string || '',
    title: formData.get('title') as string || '',
    status: formData.get('status') as string || 'new',
    source: formData.get('source') as string || '',
    notes: formData.get('notes') as string || '',
    linkedin_url: formData.get('linkedin_url') as string || '',
  };

  const validated = createLeadSchema.safeParse(rawData);
  
  if (!validated.success) {
    return {
      error: 'Invalid input',
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
  const tenantId = await getSessionTenantId();
  
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
