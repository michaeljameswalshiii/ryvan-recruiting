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
 * Always returns an array, guarding against corrupted DynamoDB data
 */
export async function getAllLeads(tenantId: string): Promise<Lead[]> {
  const cacheKey = makeCacheKey(tenantId, 'leads', 'all');

  try {
    // Always query DynamoDB for list accuracy (avoid empty-cache after create on other instances)
    const result = await queryItems<Lead>(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    // GUARD: Ensure we always have an array - even if DynamoDB returns corrupted data
    const leads = Array.isArray(result.items) ? result.items : [];

    console.log('[getAllLeads] tenant=', tenantId, 'count=', leads.length);

    // Cache briefly for detail enrichment paths
    await setCached(cacheKey, leads, 30);

    return leads;
  } catch (error: any) {
    // Table doesn't exist or other error - return empty array gracefully
    console.error('[getAllLeads] Error fetching leads:', error?.message);
    // Fall back to cache if present
    const cached = await getCached<Lead[]>(cacheKey);
    if (cached && Array.isArray(cached)) return cached;
    return [];
  }
}

/**
 * Normalize a lead's linkedJobIds to ensure it's always an array
 * Guards against corrupted data in DynamoDB
 */
function normalizeLinkedJobIds(linkedJobIds: unknown): string[] {
  return Array.isArray(linkedJobIds) ? linkedJobIds : [];
}

/**
 * Normalize a lead's linkedJobs to ensure it's always an array
 * Guards against corrupted data in DynamoDB
 */
function normalizeLinkedJobs(linkedJobs: unknown): LinkedJob[] {
  return Array.isArray(linkedJobs) ? linkedJobs : [];
}

/**
 * Get all leads with enriched linked job data
 * Fetches job info for all linkedJobIds and returns enriched leads
 * Includes defensive normalization for corrupted data
 */
export async function getAllLeadsWithLinkedJobs(tenantId: string): Promise<(Lead & { linkedJobs: LinkedJob[] })[]> {
  const leads = await getAllLeads(tenantId);
  
  // Get all jobs for the tenant to look up by ID
  const allJobs = await getAllJobs(tenantId);
  const jobsMap = new Map(allJobs.map(job => [job.id, job]));
  
  // Enrich leads with linked job data
  const enrichedLeads = leads.map(lead => {
    // NORMALIZE linkedJobIds to always be an array
    const safeLinkedJobIds = normalizeLinkedJobIds(lead.linkedJobIds);
    
    // NORMALIZE linkedJobs to always be an array (new application-centric model)
    const safeExistingLinkedJobs = normalizeLinkedJobs(lead.linkedJobs);
    
    const linkedJobs: LinkedJob[] = [];
    
    // First, add any explicitly stored linkedJobs
    if (safeExistingLinkedJobs.length > 0) {
      for (const linkedJob of safeExistingLinkedJobs) {
        if (linkedJob.jobId) {
          linkedJobs.push(linkedJob);
        }
      }
    }
    
    // Then, add any from linkedJobIds that aren't already included
    if (safeLinkedJobIds.length > 0) {
      for (const jobId of safeLinkedJobIds) {
        const alreadyIncluded = linkedJobs.some(j => j.jobId === jobId);
        if (!alreadyIncluded) {
          const job = jobsMap.get(jobId);
          if (job) {
            linkedJobs.push({
              jobId: job.id,
              jobTitle: job.title,
              companyName: job.companyName,
              stage: 'sourced',
            });
          }
        }
      }
    }
    
    return {
      ...lead,
      linkedJobIds: safeLinkedJobIds,
      linkedJobs,
    };
  });
  
  return enrichedLeads;
}

/**
 * Get leads by status
 */
export async function getLeadsByStatus(tenantId: string, status: string): Promise<Lead[]> {
  const result = await queryItems<Lead>(
    leadsTable,
    'tenant_id = :tenantId AND #status = :status',
    { ':tenantId': tenantId, ':status': status },
    { '#status': 'status' }
  );
  return result.items || [];
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

const extra = data as Record<string, unknown>;
  const lead: Lead & Record<string, unknown> = {
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

  // Resume metadata (careers apply + dashboard upload) — not all on base Lead type
  if (extra.resume_file_name || extra.resumeFileName) {
    lead.resume_file_name = String(extra.resume_file_name || extra.resumeFileName);
  }
  if (extra.resume_key || extra.resumeKey || extra.resume_s3_key) {
    const key = String(
      extra.resume_key || extra.resumeKey || extra.resume_s3_key || ''
    );
    lead.resume_key = key;
    lead.resume_s3_key = key;
  }
  // When resume_url is already an S3 key, mirror it into key fields
  if (
    lead.resume_url &&
    !String(lead.resume_url).startsWith('http') &&
    !lead.resume_key
  ) {
    lead.resume_key = lead.resume_url;
    lead.resume_s3_key = lead.resume_url;
  }
  if (extra.summary) lead.summary = extra.summary;
  if (extra.skills) lead.skills = extra.skills;
  if (extra.experience) lead.experience = extra.experience;
  if (extra.education) lead.education = extra.education;
  if (extra.certifications) lead.certifications = extra.certifications;
  if (extra.salary_requirements) {
    lead.salary_requirements = extra.salary_requirements;
  }
  if (extra.full_address) lead.full_address = extra.full_address;

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
  if (data.company !== undefined) {
    updates.push('#company = :company');
    values[':company'] = data.company;
    names['#company'] = 'company';
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
  let oldStage = "";
  let jobTitle = "Job";
  
  if (jobIndex >= 0) {
    oldStage = currentLinkedJobs[jobIndex].stage || "";
    jobTitle = currentLinkedJobs[jobIndex].jobTitle || "Job";
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
  const updated = await updateLead(tenantId, leadId, {
    linkedJobs: currentLinkedJobs as any,
  });

  try {
    const { recordJobStageChanged } = await import(
      "@/lib/events/candidate-events"
    );
    await recordJobStageChanged(
      leadId,
      jobId,
      jobTitle,
      oldStage,
      newStage,
      userId || "system"
    );
  } catch (e) {
    console.warn("[updateCandidateStageInJob] activity:", e);
  }

  return updated;
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
  initialStage: string = 'sourced',
  options?: { skipDualWrite?: boolean; skipActivityLog?: boolean }
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
  
  // Add new job entry (avoid undefined properties for DynamoDB map/list values)
  const newLinkedJob: any = {
    jobId,
    jobTitle,
    stage: initialStage,
    stageUpdatedAt: now,
    stageUpdatedBy: '',
    notes: [],
  };

  if (companyId !== undefined) {
    newLinkedJob.companyId = companyId;
  }

  if (companyName !== undefined) {
    newLinkedJob.companyName = companyName;
  }

  // Also maintain legacy linkedJobIds for backward compatibility
  const currentLinkedJobIds = lead.linkedJobIds || [];
  const newLinkedJobIds = [...currentLinkedJobIds, jobId];

  // Update the lead with both linkedJobs and linkedJobIds
  const updated = await updateLead(tenantId, leadId, {
    linkedJobs: [...currentLinkedJobs, newLinkedJob] as any,
    linkedJobIds: newLinkedJobIds,
  });

  // Dual-write: keep job.candidates in sync (skip when called from job side)
  if (!options?.skipDualWrite) {
    try {
      const { linkCandidateToJob } = await import("./job-repository");
      await linkCandidateToJob(
        tenantId,
        jobId,
        {
          candidateId: leadId,
          candidateName: lead.name || "Candidate",
          candidateEmail: lead.email || "",
          stage: initialStage,
        },
        { skipDualWrite: true }
      );
    } catch (err: any) {
      // Already linked on job side is fine
      if (
        !String(err?.message || "")
          .toLowerCase()
          .includes("already linked")
      ) {
        console.warn(
          "[linkCandidateToJobForApplication] job dual-write:",
          err
        );
      }
    }
  }

  // Activity log (skip if caller will log — API may also log; use option)
  if (!options?.skipActivityLog) {
    try {
      const { recordJobLinked } = await import("@/lib/events/candidate-events");
      await recordJobLinked(leadId, jobId, jobTitle, "system", {
        companyName,
        stage: initialStage,
      });
    } catch (e) {
      console.warn("[linkCandidateToJobForApplication] activity:", e);
    }
  }

  return updated;
}

/**
 * Unlink a candidate from a job
 * Removes the job from linkedJobs
 */
export async function unlinkCandidateFromJobForApplication(
  tenantId: string,
  leadId: string,
  jobId: string,
  options?: { skipDualWrite?: boolean; skipActivityLog?: boolean }
): Promise<Lead | null> {
  // Get the current lead
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    throw new Error('Candidate not found');
  }

  // Filter out the job from linkedJobs
  const currentLinkedJobs = lead.linkedJobs || [];
  const removed = currentLinkedJobs.find((j) => j.jobId === jobId);
  const newLinkedJobs = currentLinkedJobs.filter(j => j.jobId !== jobId);
  
  // Also update legacy linkedJobIds
  const currentLinkedJobIds = lead.linkedJobIds || [];
  const newLinkedJobIds = currentLinkedJobIds.filter(id => id !== jobId);

  // If nothing changed, job was not linked (or wrong jobId)
  if (newLinkedJobs.length === currentLinkedJobs.length) {
    throw new Error("Candidate is not linked to this job");
  }

  // Update the lead
  const updated = await updateLead(tenantId, leadId, {
    linkedJobs: newLinkedJobs as any,
    linkedJobIds: newLinkedJobIds,
  });

  // Dual-write: remove from job.candidates
  if (!options?.skipDualWrite) {
    try {
      const { unlinkCandidateFromJob } = await import("./job-repository");
      await unlinkCandidateFromJob(tenantId, jobId, leadId, {
        skipDualWrite: true,
      });
    } catch (err) {
      console.warn(
        "[unlinkCandidateFromJobForApplication] job dual-write:",
        err
      );
    }
  }

  if (!options?.skipActivityLog) {
    try {
      const { recordJobUnlinked } = await import(
        "@/lib/events/candidate-events"
      );
      const result = await recordJobUnlinked(
        leadId,
        jobId,
        removed?.jobTitle || jobId,
        "system"
      );
      if (!result.success) {
        console.warn(
          "[unlinkCandidateFromJobForApplication] activity failed:",
          result.error
        );
      }
    } catch (e) {
      console.warn("[unlinkCandidateFromJobForApplication] activity:", e);
    }
  }

  return updated;
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
