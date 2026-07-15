/**
 * Job Server Actions
 * Server-side CRUD operations for jobs using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { 
  getAllJobs, 
  getJobsByStatus, 
  getOpenJobs,
  createJob as createJobRepo, 
  getJobById, 
  updateJob, 
  deleteJob,
  getJobStats,
  linkCandidateToJob,
  unlinkCandidateFromJob,
  updateCandidateStageInJob
} from '../db/repositories';
import { createJobSchema } from '../schemas/job';

/**
 * Helper to safely convert any value to ISO string
 */
function toISOString(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  // Handle string timestamps or numeric timestamps
  const date = new Date(value);
  if (!isNaN(date.getTime())) return date.toISOString();
  return undefined;
}

/**
 * Sanitize a job object to ensure all date fields are ISO strings (JSON serializable)
 * Uses deep clone to ensure no circular references or non-serializable values
 */
function sanitizeJob(job: any): any {
  if (!job) return job;
  
  // Deep clone and sanitize - handle any date-like field
  const sanitized: any = {};
  
  for (const key of Object.keys(job)) {
    const value = job[key];
    
    if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      // Handle arrays (like candidates)
      sanitized[key] = value.map((item: any) => {
        if (item && typeof item === 'object') {
          // Recursively sanitize object items
          const sanitizedItem: any = {};
          for (const itemKey of Object.keys(item)) {
            const itemValue = item[itemKey];
            if (itemValue instanceof Date) {
              sanitizedItem[itemKey] = itemValue.toISOString();
            } else if (typeof itemValue === 'string' && itemValue.match(/^\d{4}-\d{2}/)) {
              // Already ISO string
              sanitizedItem[itemKey] = itemValue;
            } else if (itemValue && typeof itemValue === 'object' && itemValue.toISOString) {
              // Has toISOString method (Date-like)
              sanitizedItem[itemKey] = itemValue.toISOString();
            } else {
              sanitizedItem[itemKey] = itemValue;
            }
          }
          return sanitizedItem;
        }
        return item;
      });
    } else if (value instanceof Date) {
      sanitized[key] = value.toISOString();
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects - check for date-like properties
      const nested: any = {};
      for (const nestedKey of Object.keys(value)) {
        const nestedValue = value[nestedKey];
        if (nestedValue instanceof Date) {
          nested[nestedKey] = nestedValue.toISOString();
        } else if (typeof nestedValue === 'string' && nestedValue.match(/^\d{4}-\d{2}/)) {
          nested[nestedKey] = nestedValue;
        } else if (nestedValue && typeof nestedValue === 'object' && nestedValue.toISOString) {
          nested[nestedKey] = nestedValue.toISOString();
        } else {
          nested[nestedKey] = nestedValue;
        }
      }
      sanitized[key] = nested;
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Get all jobs for the current tenant
 */
export async function getJobs(includeStats = false) {
  console.log('[getJobs] Starting...');
  
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  // DEBUG: Log the raw cookie session
  console.log('[getJobs] Session - tenantId:', tenantId, 'userId:', userId);
  console.log('[getJobs] DEBUG - After fallback would be:', !tenantId && userId ? `tenant-${userId}` : 'no fallback');

  // If no tenantId but user is logged in, use default tenant
  if (!tenantId && userId) {
    console.log('[getJobs] No tenantId, using default: tenant-' + userId);
    tenantId = `tenant-${userId}`;
  }

  if (!tenantId) {
    console.log('[getJobs] No tenant - returning empty');
    // Not logged in - return empty array (not an error)
    return { jobs: [] };
  }

  try {
    console.log('[getJobs] Fetching jobs for tenant:', tenantId);
    const jobs = await getAllJobs(tenantId);
    console.log('[getJobs] Got jobs:', jobs?.length || 0);
    
    // Sanitize all jobs to ensure JSON serializability (no Date objects)
    const sanitizedJobs = (jobs || []).map(sanitizeJob);
    console.log('[getJobs] Sanitized jobs:', sanitizedJobs?.length || 0);
    
    let result: Record<string, unknown> = { jobs: sanitizedJobs };

    if (includeStats) {
      console.log('[getJobs] Getting stats...');
      const stats = await getJobStats(tenantId);
      result = { ...result, stats };
    }

    return result;
  } catch (error: any) {
    console.error('[getJobs] Error:', error?.message, error?.stack);
    return { error: error.message || 'Failed to get jobs', stack: error?.stack };
  }
}

/**
 * Get jobs by status
 */
export async function getJobsByStatusAction(status: string) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }

  if (!tenantId) {
    return { jobs: [] };
  }

  try {
    const jobs = await getJobsByStatus(tenantId, status);
    // Sanitize jobs to ensure JSON serializability
    const sanitizedJobs = (jobs || []).map(sanitizeJob);
    return { jobs: sanitizedJobs };
  } catch (error: any) {
    return { error: error.message || 'Failed to get jobs' };
  }
}

/**
 * Get open jobs only
 */
export async function getOpenJobsAction() {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }

  if (!tenantId) {
    return { jobs: [] };
  }

  try {
    const jobs = await getOpenJobs(tenantId);
    // Sanitize jobs to ensure JSON serializability
    const sanitizedJobs = (jobs || []).map(sanitizeJob);
    return { jobs: sanitizedJobs };
  } catch (error: any) {
    return { error: error.message || 'Failed to get open jobs' };
  }
}

/**
 * Get a single job by ID
 */
export async function getJobByIdAction(jobId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const job = await getJobById(tenantId, jobId);
    // Sanitize the job to ensure JSON serializability
    return { job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
    return { error: error.message || 'Failed to get job' };
  }
}

/**
 * Create a new job
 */
export async function createJobAction(formData: FormData) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  console.log('[createJobAction] Session → tenantId:', tenantId, 'userId:', userId);

  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
    console.log('[createJobAction] Using default tenant:', tenantId);
  }

  if (!tenantId) {
    return { error: 'No tenant ID found. Please log in again.' };
  }

  const showRaw = formData.get('showOnWebsite');
  const rawData = {
    title: formData.get('title') as string,
    description: formData.get('description') as string || '',
    location: formData.get('location') as string || '',
    salaryRange: formData.get('salaryRange') as string || '',
    employmentType: formData.get('employmentType') as string || 'Full-time',
    companyId: formData.get('companyId') as string,
    companyName: formData.get('companyName') as string,
    status: formData.get('status') as string || 'Open',
    showOnWebsite:
      showRaw !== null &&
      ['true', '1', 'yes'].includes(String(showRaw).toLowerCase()),
  };

  console.log('[createJobAction] rawData:', JSON.stringify(rawData));

  const validated = createJobSchema.safeParse(rawData);
  
  if (!validated.success) {
    console.log('[createJobAction] Zod validation failed:', JSON.stringify(validated.error.flatten().fieldErrors));
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

try {
    const job = await createJobRepo(tenantId, validated.data);
    // Sanitize the job to ensure JSON serializability
    return { success: true, job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
    return { error: error.message || 'Failed to create job' };
  }
}

/**
 * Update an existing job
 */
export async function updateJobAction(jobId: string, formData: FormData) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  const rawData: Record<string, unknown> = {};
  
  // Only include fields that are provided
  const fields = ['title', 'description', 'location', 'salaryRange', 'employmentType', 'companyId', 'companyName', 'status'];
  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null && value !== undefined && value !== '') {
      rawData[field] = value;
    }
  }

  // Boolean: allow explicit false (FormData is always string)
  if (formData.has('showOnWebsite')) {
    const v = String(formData.get('showOnWebsite')).toLowerCase();
    rawData.showOnWebsite = v === 'true' || v === '1' || v === 'yes';
  }

try {
    const job = await updateJob(tenantId, jobId, rawData);
    // Sanitize the job to ensure JSON serializability
    return { success: true, job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
    return { error: error.message || 'Failed to update job' };
  }
}

/**
 * Delete a job
 */
export async function deleteJobAction(jobId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    await deleteJob(tenantId, jobId);
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to delete job' };
  }
}

/**
 * Link a candidate to a job
 */
export async function linkCandidateToJobAction(jobId: string, candidateData: {
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  stage?: string;
  notes?: string;
}) {
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!tenantId || !userId) {
    return { error: 'Unauthorized — please log in again' };
  }

  if (!jobId?.trim()) {
    return { error: 'Job id is required' };
  }
  if (!candidateData?.candidateId?.trim()) {
    return { error: 'Select a candidate to link' };
  }
  if (!candidateData?.candidateName?.trim()) {
    return { error: 'Candidate name is required' };
  }

  try {
    const email =
      candidateData.candidateEmail && candidateData.candidateEmail.includes('@')
        ? candidateData.candidateEmail
        : undefined;

    const job = await linkCandidateToJob(tenantId, jobId, {
      candidateId: candidateData.candidateId.trim(),
      candidateName: candidateData.candidateName.trim(),
      candidateEmail: email,
      stage: candidateData.stage || 'sourced',
      notes: candidateData.notes?.trim() || undefined,
    } as any);
    // Sanitize the job to ensure JSON serializability
    return { success: true, job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
    console.error('[linkCandidateToJobAction]', error);
    return { error: error.message || 'Failed to link candidate' };
  }
}

/**
 * Unlink a candidate from a job
 */
export async function unlinkCandidateFromJobAction(jobId: string, candidateId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const job = await unlinkCandidateFromJob(tenantId, jobId, candidateId);
    // Sanitize the job to ensure JSON serializability
    return { success: true, job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
    return { error: error.message || 'Failed to unlink candidate' };
  }
}

/**
 * Update candidate stage in a job
 */
export async function updateCandidateStageAction(jobId: string, candidateId: string, stage: string, notes?: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const job = await updateCandidateStageInJob(tenantId, jobId, { candidateId, stage, notes });
    // Sanitize the job to ensure JSON serializability
    return { success: true, job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
    return { error: error.message || 'Failed to update stage' };
  }
}
