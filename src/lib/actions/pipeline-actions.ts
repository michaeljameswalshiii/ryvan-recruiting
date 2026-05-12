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
    email: formData.get('email') as string || '',
    phone: formData.get('phone') as string || '',
    company: formData.get('company') as string || '',
    title: formData.get('title') as string || '',
    stage: formData.get('stage') as string || 'new',
    source: formData.get('source') as string || '',
    notes: formData.get('notes') as string || '',
    linkedin_url: formData.get('linkedin_url') as string || '',
    resume_url: formData.get('resume_url') as string || '',
    scheduled_date: formData.get('scheduled_date') as string || '',
    rating: formData.get('rating') ? Number(formData.get('rating')) : undefined,
  };

const validated = createPipelineSchema.safeParse(rawData);
  
  if (!validated.success) {
    console.log('[PIPELINE-ACTION] Validation errors:', JSON.stringify(validated.error.flatten().fieldErrors));
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const pipeline = await createPipelineItem(tenantId, validated.data);
    return { success: true, pipeline };
  } catch (error: any) {
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
