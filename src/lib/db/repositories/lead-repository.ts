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
import { 
  type Lead, 
  type CreateLeadInput, 
  type UpdateLeadInput, 
  type LinkedJob,
  APPLICATION_STAGES,
  APPLICATION_STAGE_VALUES,
  type JobNote,
} from '../../schemas/lead';
import { getJobById, getAllJobs } from './job-repository';

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

// ============================================================================
// NEW: Application-centric model helpers
// ============================================================================

/**
 * Map legacy job stage to new APPLICATION_STAGES
 * Handles backward compatibility during migration
 * Per task spec: sourced -> left_message -> text -> email -> other -> contacted -> pre_screened -> submitted -> interviewing -> offer_out -> offer_accepted -> offer_declined -> placed -> rejected -> not_interested
 */
export function mapLegacyStageToApplicationStage(legacyStage: string): string {
  const stageMapping: Record<string, string> = {
    'Applied': 'sourced',
    'Screening': 'pre_screened',
    'Interviewing': 'interviewing',
    'Offered': 'offer_out',
    'Placed': 'placed',
    'Rejected': 'rejected',
    'Withdrawn': 'not_interested',
    // Legacy lead statuses
    'identification': 'sourced',
    'outreach': 'contacted',
    'conversation': 'pre_screened',
    'presented': 'submitted',
    'interview': 'interviewing',
    'accept': 'offer_accepted',
    'new': 'sourced',
    'converted': 'placed',
    'contacted': 'contacted',
    'qualified': 'pre_screened',
    'interested': 'contacted',
    'not_interested': 'not_interested',
  };
  
  return stageMapping[legacyStage] || 'sourced';
}

/**
 * Validate if a stage value is a valid APPLICATION_STAGE
 */
export function isValidApplicationStage(stage: string): boolean {
  return APPLICATION_STAGE_VALUES.includes(stage as any);
}

/**
 * Generate a new UUID for notes
 */
function generateNoteId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
 * Get all leads with enriched linked job data
 * Fetches job info for all linkedJobIds and returns enriched leads
 */
export async function getAllLeadsWithLinkedJobs(tenantId: string): Promise<(Lead & { linkedJobs: LinkedJob[] })[]> {
  const leads = await getAllLeads(tenantId);
  
// Get all jobs for the tenant to look up by ID
  const allJobs = await getAllJobs(tenantId);
  const jobsMap = new Map(allJobs.map(job => [job.id, job]));
  
  // Enrich leads with linked job data
  const enrichedLeads = leads.map(lead => {
    const linkedJobs: LinkedJob[] = [];
    
    if (lead.linkedJobIds && lead.linkedJobIds.length > 0) {
      for (const jobId of lead.linkedJobIds) {
        const job = jobsMap.get(jobId);
        if (job) {
          linkedJobs.push({
            jobId: job.id,
            jobTitle: job.title,
            companyName: job.companyName,
          });
        }
      }
    }
    
    return {
      ...lead,
      linkedJobs,
    };
  });
  
  return enrichedLeads;
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
    location: validated.location || '',
    title: validated.title || '',
    status: validated.status || 'identification',
    source: validated.source || '',
    notes: validated.notes || '',
    linkedin_url: validated.linkedin_url || '',
    resume_url: validated.resume_url || '',
    linkedJobIds: validated.linkedJobIds || [],
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
  if (data.location !== undefined) {
    updates.push('#location = :location');
    values[':location'] = data.location;
    names['#location'] = 'location';
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
if (data.resume_url !== undefined) {
    updates.push('#resume_url = :resume_url');
    values[':resume_url'] = data.resume_url;
    names['#resume_url'] = 'resume_url';
  }
  if (data.full_address !== undefined) {
    updates.push('#full_address = :full_address');
    values[':full_address'] = data.full_address;
    names['#full_address'] = 'full_address';
  }
  if (data.salary_requirements !== undefined) {
    updates.push('#salary_requirements = :salary_requirements');
    values[':salary_requirements'] = data.salary_requirements;
    names['#salary_requirements'] = 'salary_requirements';
  }
  if (data.summary !== undefined) {
    updates.push('#summary = :summary');
    values[':summary'] = data.summary;
    names['#summary'] = 'summary';
  }
  if (data.skills !== undefined) {
    updates.push('#skills = :skills');
    values[':skills'] = data.skills;
    names['#skills'] = 'skills';
  }
  if (data.experience !== undefined) {
    updates.push('#experience = :experience');
    values[':experience'] = data.experience;
    names['#experience'] = 'experience';
  }
  if (data.education !== undefined) {
    updates.push('#education = :education');
    values[':education'] = data.education;
    names['#education'] = 'education';
  }
if (data.certifications !== undefined) {
    updates.push('#certifications = :certifications');
    values[':certifications'] = data.certifications;
    names['#certifications'] = 'certifications';
  }
if (data.linkedJobIds !== undefined) {
    updates.push('#linkedJobIds = :linkedJobIds');
    values[':linkedJobIds'] = data.linkedJobIds;
    names['#linkedJobIds'] = 'linkedJobIds';
  }

  // NEW: Support for linkedJobs (application-centric model)
  if (data.linkedJobs !== undefined) {
    updates.push('#linkedJobs = :linkedJobs');
    values[':linkedJobs'] = data.linkedJobs;
    names['#linkedJobs'] = 'linkedJobs';
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

// ============================================================================
// NEW: Application-centric model functions
// ============================================================================

/**
 * Update a candidate's stage in a specific job
 * This is the core function for the application-centric model
 */
export async function updateCandidateStageInJob(
  tenantId: string,
  leadId: string,
  jobId: string,
  newStage: string,
  userId?: string
): Promise<Lead | null> {
  // Get the current lead
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    throw new Error('Candidate not found');
  }

  // Get current linkedJobs array or initialize empty
  const currentLinkedJobs = lead.linkedJobs || [];
  
  // Find the job in linkedJobs
  const jobIndex = currentLinkedJobs.findIndex(j => j.jobId === jobId);
  
  const now = new Date().toISOString();
  
  if (jobIndex >= 0) {
    // Update existing job entry
    currentLinkedJobs[jobIndex] = {
      ...currentLinkedJobs[jobIndex],
      stage: newStage,
      stageUpdatedAt: now,
      stageUpdatedBy: userId || '',
    };
  } else {
    // This should not happen if candidate is properly linked, but handle gracefully
    throw new Error('Candidate is not linked to this job');
  }

  // Update the lead with new linkedJobs
  return updateLead(tenantId, leadId, { linkedJobs: currentLinkedJobs as any });
}

/**
 * Add a job-specific note to a candidate's job application
 */
export async function addJobSpecificNote(
  tenantId: string,
  leadId: string,
  jobId: string,
  noteContent: string,
  userId: string,
  userName?: string,
  relatedStage?: string
): Promise<Lead | null> {
  // Get the current lead
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    throw new Error('Candidate not found');
  }

  // Get current linkedJobs array or initialize empty
  const currentLinkedJobs = lead.linkedJobs || [];
  
  // Find the job in linkedJobs
  const jobIndex = currentLinkedJobs.findIndex(j => j.jobId === jobId);
  
  if (jobIndex < 0) {
    throw new Error('Candidate is not linked to this job');
  }

  // Create the new note
  const newNote: JobNote = {
    id: generateNoteId(),
    content: noteContent,
    createdAt: new Date().toISOString(),
    createdBy: userId,
    createdByName: userName,
    relatedStage: relatedStage || currentLinkedJobs[jobIndex].stage,
  };

  // Add note to the job's notes array
  const currentNotes = currentLinkedJobs[jobIndex].notes || [];
  currentLinkedJobs[jobIndex] = {
    ...currentLinkedJobs[jobIndex],
    notes: [...currentNotes, newNote],
  };

  // Update the lead with new linkedJobs
  return updateLead(tenantId, leadId, { linkedJobs: currentLinkedJobs as any });
}

/**
 * Link a candidate to a job with initial stage
 * Creates the linkedJobs entry
 */
export async function linkCandidateToJobForApplication(
  tenantId: string,
  leadId: string,
  jobId: string,
  jobTitle: string,
  companyId?: string,
  companyName?: string,
  initialStage: string = 'sourced'
): Promise<Lead | null> {
  // Get the current lead
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    throw new Error('Candidate not found');
  }

  // Get current linkedJobs array or initialize empty
  const currentLinkedJobs = lead.linkedJobs || [];
  
  // Check if already linked
  if (currentLinkedJobs.some(j => j.jobId === jobId)) {
    throw new Error('Candidate already linked to this job');
  }

  const now = new Date().toISOString();
  
  // Add new job entry
  const newLinkedJob = {
    jobId,
    jobTitle,
    companyId,
    companyName,
    stage: initialStage,
    stageUpdatedAt: now,
    stageUpdatedBy: '',
    notes: [],
  };

  // Also maintain legacy linkedJobIds for backward compatibility
  const currentLinkedJobIds = lead.linkedJobIds || [];
  const newLinkedJobIds = [...currentLinkedJobIds, jobId];

  // Update the lead with both linkedJobs and linkedJobIds
  return updateLead(tenantId, leadId, { 
    linkedJobs: [...currentLinkedJobs, newLinkedJob] as any,
    linkedJobIds: newLinkedJobIds,
  });
}

/**
 * Unlink a candidate from a job
 * Removes the job from linkedJobs
 */
export async function unlinkCandidateFromJobForApplication(
  tenantId: string,
  leadId: string,
  jobId: string
): Promise<Lead | null> {
  // Get the current lead
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    throw new Error('Candidate not found');
  }

  // Filter out the job from linkedJobs
  const currentLinkedJobs = lead.linkedJobs || [];
  const newLinkedJobs = currentLinkedJobs.filter(j => j.jobId !== jobId);
  
  // Also update legacy linkedJobIds
  const currentLinkedJobIds = lead.linkedJobIds || [];
  const newLinkedJobIds = currentLinkedJobIds.filter(id => id !== jobId);

  // If nothing changed, no need to update
  if (newLinkedJobs.length === currentLinkedJobs.length) {
    return lead;
  }

  // Update the lead
  return updateLead(tenantId, leadId, { 
    linkedJobs: newLinkedJobs as any,
    linkedJobIds: newLinkedJobIds,
  });
}

/**
 * Get all job-specific notes for a candidate's job application
 */
export async function getJobSpecificNotes(
  tenantId: string,
  leadId: string,
  jobId: string
): Promise<JobNote[]> {
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    return [];
  }

  const currentLinkedJobs = lead.linkedJobs || [];
  const jobEntry = currentLinkedJobs.find(j => j.jobId === jobId);
  
  return jobEntry?.notes || [];
}

/**
 * Check if candidate is linked to a job
 */
export async function isCandidateLinkedToJob(
  tenantId: string,
  leadId: string,
  jobId: string
): Promise<boolean> {
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    return false;
  }

  const currentLinkedJobs = lead.linkedJobs || [];
  return currentLinkedJobs.some(j => j.jobId === jobId);
}

/**
 * Get all jobs a candidate is linked to (with stage info)
 */
export async function getLinkedJobsForCandidate(
  tenantId: string,
  leadId: string
): Promise<LinkedJob[]> {
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    return [];
  }

  return (lead.linkedJobs || []) as LinkedJob[];
}
