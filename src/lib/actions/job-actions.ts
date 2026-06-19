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
 * Sanitize a job object to ensure all date fields are ISO strings (JSON serializable)
 */
function sanitizeJob(job: any): any {
  if (!job) return job;
  return {
    ...job,
    // Handle created_at - could be Date object or string
    created_at: job.created_at instanceof Date
      ? job.created_at.toISOString()
      : typeof job.created_at === 'string'
        ? job.created_at
        : job.created_at
          ? new Date(job.created_at).toISOString()
          : undefined,
    // Handle modified_at - could be Date object or string  
    modified_at: job.modified_at instanceof Date
      ? job.modified_at.toISOString()
      : typeof job.modified_at === 'string'
        ? job.modified_at
        : job.modified_at
          ? new Date(job.modified_at).toISOString()
          : undefined,
    // Handle any nested candidate dates
    candidates: Array.isArray(job.candidates)
      ? job.candidates.map((c: any) => ({
          ...c,
          dateApplied: c.dateApplied instanceof Date
            ? c.dateApplied.toISOString()
            : typeof c.dateApplied === 'string'
              ? c.dateApplied
              : c.dateApplied
                ? new Date(c.dateApplied).toISOString()
                : undefined,
        }))
      : [],
  };
}

/**
 * Get all jobs for the current tenant
 */
export async function getJobs(includeStats = false) {
  console.log('[getJobs] Starting...');
  
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  console.log('[getJobs] Session - tenantId:', tenantId, 'userId:', userId);

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

  const rawData = {
    title: formData.get('title') as string,
    description: formData.get('description') as string || '',
    location: formData.get('location') as string || '',
    salaryRange: formData.get('salaryRange') as string || '',
    employmentType: formData.get('employmentType') as string || 'Full-time',
    companyId: formData.get('companyId') as string,
    companyName: formData.get('companyName') as string,
    status: formData.get('status') as string || 'Open',
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
    return { error: 'Unauthorized' };
  }

  try {
    const job = await linkCandidateToJob(tenantId, jobId, candidateData);
    // Sanitize the job to ensure JSON serializability
    return { success: true, job: job ? sanitizeJob(job) : null };
  } catch (error: any) {
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
