/**
 * Pipeline Server Actions
 * Server-side CRUD operations for pipeline using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { 
  getAllPipeline, 
  createPipelineItem, 
  getPipelineById,
  updatePipelineItem, 
  deletePipelineItem 
} from '../db/repositories/pipeline-repository';
import { createPipelineSchema, updatePipelineSchema } from '../schemas/pipeline';

/**
 * Get all pipeline items for the current tenant
 */
export async function getPipeline() {
  console.log('[PIPELINE-ACTION] getPipeline called');
  
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  console.log('[PIPELINE-ACTION] tenantId:', tenantId, 'userId:', userId);

  // If no tenantId but user is logged in, use default tenant
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
    console.log('[PIPELINE-ACTION] Using fallback tenantId:', tenantId);
  }

  if (!tenantId) {
    // Not logged in - return empty array (not an error)
    console.log('[PIPELINE-ACTION] No tenantId, returning empty array');
    return { pipeline: [] };
  }

  try {
    console.log('[PIPELINE-ACTION] Calling getAllPipeline with tenantId:', tenantId);
    const pipeline = await getAllPipeline(tenantId);
    console.log('[PIPELINE-ACTION] getAllPipeline returned:', pipeline?.length || 0, 'items');
    return { pipeline };
  } catch (error: any) {
    console.error('[PIPELINE-ACTION] Error:', error);
    return { error: error.message || 'Failed to get pipeline' };
  }
}

/**
 * Get a single pipeline item by ID
 */
export async function getPipelineByIdAction(pipelineId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const pipeline = await getPipelineById(tenantId, pipelineId);
    return { pipeline };
  } catch (error: any) {
    return { error: error.message || 'Failed to get pipeline item' };
  }
}

/**
 * Create a new pipeline item
 */
export async function createPipeline(formData: FormData) {
  console.log('[PIPELINE-ACTION] createPipeline called');
  
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  console.log('[PIPELINE-ACTION] userId:', userId, 'tenantId:', tenantId);
  
  if (!userId) {
    console.error('[PIPELINE-ACTION] No userId - unauthorized');
    return { error: 'Unauthorized' };
  }

  // If no tenantId but user is logged in, create/use default tenant
  if (!tenantId) {
    tenantId = `tenant-${userId}`;
    console.log('[PIPELINE-ACTION] Using fallback tenantId:', tenantId);
  }

// Get all form fields
  const name = formData.get('name');
  const email = formData.get('email');
  const company = formData.get('company');
  const clientId = formData.get('clientId');
  const phone = formData.get('phone');
  const notes = formData.get('notes');
  const stage = formData.get('stage') || 'new';
  
  console.log('[PIPELINE-ACTION] Raw input:', { name, email, company, clientId, phone, notes, stage });

  // Build raw data - ensure strings, not null
  const rawData = {
    name: String(name || ''),
    email: String(email || ''),
    phone: String(phone || ''),
    company: String(company || ''),
    clientId: clientId ? String(clientId) : undefined,
    title: '',
    stage: String(stage),
    source: '',
    notes: String(notes || ''),
    linkedin_url: '',
    resume_url: '',
    scheduled_date: '',
    rating: undefined,
  };

  console.log('[PIPELINE-ACTION] Parsed data:', JSON.stringify(rawData));

  // Validate
  const validated = createPipelineSchema.safeParse(rawData);
  
  if (!validated.success) {
    console.error('[PIPELINE-ACTION] Validation failed:', JSON.stringify(validated.error.flatten().fieldErrors));
    return {
      error: 'Invalid input: ' + JSON.stringify(validated.error.flatten().fieldErrors),
      details: validated.error.flatten().fieldErrors,
    };
  }

  console.log('[PIPELINE-ACTION] Validation passed, creating item...');

  try {
    const pipeline = await createPipelineItem(tenantId, validated.data);
    console.log('[PIPELINE-ACTION] Created successfully:', pipeline);
    return { success: true, pipeline };
  } catch (error: any) {
    console.error('[PIPELINE-ACTION] Create error:', error);
    return { error: error.message || 'Failed to create pipeline item' };
  }
}

/**
 * Update an existing pipeline item
 */
export async function updatePipelineAction(pipelineId: string, formData: FormData) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

const rawData = {
    name: formData.get('name') as string || undefined,
    email: formData.get('email') as string || undefined,
    phone: formData.get('phone') as string || undefined,
    company: formData.get('company') as string || undefined,
    clientId: formData.get('clientId') as string || undefined,
    title: formData.get('title') as string || undefined,
    stage: formData.get('stage') as string || undefined,
    source: formData.get('source') as string || undefined,
    notes: formData.get('notes') as string || undefined,
    linkedin_url: formData.get('linkedin_url') as string || undefined,
    resume_url: formData.get('resume_url') as string || undefined,
    scheduled_date: formData.get('scheduled_date') as string || undefined,
    rating: formData.get('rating') ? Number(formData.get('rating')) : undefined,
  };

  const validated = updatePipelineSchema.safeParse(rawData);
  
  if (!validated.success) {
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const pipeline = await updatePipelineItem(tenantId, pipelineId, validated.data);
    return { success: true, pipeline };
  } catch (error: any) {
    return { error: error.message || 'Failed to update pipeline item' };
  }
}

/**
 * Delete a pipeline item
 */
export async function deletePipelineAction(pipelineId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    await deletePipelineItem(tenantId, pipelineId);
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to delete pipeline item' };
  }
}
