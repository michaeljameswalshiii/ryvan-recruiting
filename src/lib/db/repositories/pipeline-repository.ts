/**
 * Pipeline Repository
 * Server-only data access layer for pipeline/candidates
 * 
 * @serverOnly
 */

import {
  getItem,
  queryItems,
  putItem,
  deleteItem,
  updateItem,
  pipelineTable,
} from '../dynamodb';
import { getCached, setCached, invalidateTenantCache, makeCacheKey } from '../../cache';
import { type Pipeline, type CreatePipelineInput, type UpdatePipelineInput } from '../../schemas/pipeline';

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
 * Get all pipeline items for a tenant
 */
export async function getAllPipeline(tenantId: string): Promise<Pipeline[]> {
  console.log('[PIPELINE-REPO] getAllPipeline called with tenantId:', tenantId);
  
  // Validate tenantId
  if (!tenantId) {
    console.log('[PIPELINE-REPO] No tenantId, returning empty array');
    return [];
  }
  
  const cacheKey = makeCacheKey(tenantId, 'pipeline', 'all');
  console.log('[PIPELINE-REPO] cacheKey:', cacheKey);
  
  // Try cache first
  try {
    const cached = await getCached<Pipeline[]>(cacheKey);
    console.log('[PIPELINE-REPO] cache check result:', cached ? 'hit' : 'miss');
    if (cached) {
      return cached;
    }
  } catch (cacheError: any) {
    console.error('[PIPELINE-REPO] Cache error:', cacheError?.message);
  }
  
  // Query from DynamoDB
  console.log('[PIPELINE-REPO] Querying DynamoDB with table:', pipelineTable);
  try {
    const pipeline = await queryItems<Pipeline>(
      pipelineTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );
    console.log('[PIPELINE-REPO] DynamoDB returned:', pipeline?.length || 0, 'items');
    
    // Cache the result
    try {
      await setCached(cacheKey, pipeline, CACHE_TTL);
      console.log('[PIPELINE-REPO] Cached result');
    } catch (cacheSetError: any) {
      console.error('[PIPELINE-REPO] Cache set error:', cacheSetError?.message);
    }
    
    return pipeline;
  } catch (dbError: any) {
    const errorMessage = dbError?.message || '';
    console.error('[PIPELINE-REPO] DynamoDB error:', errorMessage);
    
    // Check for specific errors
    if (errorMessage.includes('Requested resource not found') || errorMessage.includes('Table not found')) {
      console.error('[PIPELINE-REPO] Table may not exist or tenant access issue');
      // Return empty array instead of throwing - user has no pipeline data yet
      return [];
    }
    
    // Re-throw other errors
    throw dbError;
  }
}

/**
 * Get a single pipeline item by ID
 */
export async function getPipelineById(tenantId: string, pipelineId: string): Promise<Pipeline | null> {
  const cacheKey = makeCacheKey(tenantId, 'pipeline', pipelineId);
  
  // Try cache first
  const cached = await getCached<Pipeline>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get from DynamoDB
  const pipeline = await getItem<Pipeline>(pipelineTable, {
    tenant_id: tenantId,
    id: pipelineId,
  });
  
  if (pipeline) {
    await setCached(cacheKey, pipeline, CACHE_TTL);
  }
  
  return pipeline;
}

/**
 * Create a new pipeline item
 */
export async function createPipelineItem(tenantId: string, data: CreatePipelineInput): Promise<Pipeline> {
  const validated = data;
  
  const pipeline: Pipeline = {
    id: generateId(),
    tenant_id: tenantId,
    name: validated.name,
    email: validated.email || '',
    phone: validated.phone || '',
    company: validated.company || '',
    title: validated.title || '',
    stage: validated.stage || 'new',
    source: validated.source || '',
    notes: validated.notes || '',
    linkedin_url: validated.linkedin_url || '',
    resume_url: validated.resume_url || '',
    scheduled_date: validated.scheduled_date || '',
    rating: validated.rating,
    created_at: new Date().toISOString(),
  };
  
// Save to DynamoDB with error handling
  try {
    await putItem(pipelineTable, pipeline);
  } catch (dbError: any) {
    const errorMessage = dbError?.message || '';
    console.error('[PIPELINE-REPO] Create error:', errorMessage);
    
    // Check for specific errors - table may not exist
    if (errorMessage.includes('Requested resource not found') || errorMessage.includes('Table not found')) {
      console.error('[PIPELINE-REPO] Pipeline table may not exist. Create table first or check DYNAMODB_PIPELINE_TABLE env var.');
      throw new Error('Database table not found. Please contact support.');
    }
    
    throw dbError;
  }
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return pipeline;
}

/**
 * Update a pipeline item
 */
export async function updatePipelineItem(
  tenantId: string,
  pipelineId: string,
  data: UpdatePipelineInput
): Promise<Pipeline | null> {
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
  if (data.stage !== undefined) {
    updates.push('#stage = :stage');
    values[':stage'] = data.stage;
    names['#stage'] = 'stage';
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
  if (data.resume_url !== undefined) {
    updates.push('#resume_url = :resume_url');
    values[':resume_url'] = data.resume_url;
    names['#resume_url'] = 'resume_url';
  }
  if (data.scheduled_date !== undefined) {
    updates.push('#scheduled_date = :scheduled_date');
    values[':scheduled_date'] = data.scheduled_date;
    names['#scheduled_date'] = 'scheduled_date';
  }
  if (data.rating !== undefined) {
    updates.push('#rating = :rating');
    values[':rating'] = data.rating;
    names['#rating'] = 'rating';
  }
  
  if (updates.length === 0) {
    return getPipelineById(tenantId, pipelineId);
  }
  
  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';
  
const updated = await updateItem<Pipeline>(
    pipelineTable,
    { tenant_id: tenantId, id: pipelineId },
    `SET ${updates.join(', ')}`,
    values,
    names
  );
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return updated;
}

/**
 * Delete a pipeline item
 */
export async function deletePipelineItem(tenantId: string, pipelineId: string): Promise<void> {
  await deleteItem(pipelineTable, { tenant_id: tenantId, id: pipelineId });
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
}
