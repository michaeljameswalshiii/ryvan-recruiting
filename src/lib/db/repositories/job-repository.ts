/**
 * Job Repository
 * Server-only data access layer for Jobs
 * Jobs link Companies to Candidates with tracking of candidate stages
 *
 * @serverOnly
 */

import {
  getItem,
  queryItems,
  putItem,
  deleteItem,
  updateItem,
  jobsTable,
} from '../dynamodb';
import { getCached, setCached, invalidateTenantCache, makeCacheKey } from '../../cache';
import { 
  type Job, 
  type CreateJobInput, 
  type UpdateJobInput,
  type LinkedCandidate,
  type LinkCandidateInput,
  type UpdateCandidateStageInput,
  jobCandidateStages,
  jobStatuses,
  normalizeJobStatus,
} from '../../schemas/job';

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
 * Get all jobs for a tenant
 * Always returns an array, guarding against corrupted DynamoDB data
 */
export async function getAllJobs(tenantId: string): Promise<Job[]> {
  const cacheKey = makeCacheKey(tenantId, 'jobs', 'all');
  console.log('[getAllJobs] Fetching jobs for tenant:', tenantId);

  // Try cache first - validate it's an array
  const cached = await getCached<Job[]>(cacheKey);
  if (cached && Array.isArray(cached)) {
    console.log('[getAllJobs] Returning cached jobs:', cached.length);
    return cached;
  }

  try {
    // Query from DynamoDB
    const result = await queryItems<Job>(
      jobsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    // GUARD: Ensure we always have an array - even if DynamoDB returns corrupted data
    const jobs = Array.isArray(result?.items) ? result.items : [];
    console.log('[getAllJobs] Got jobs from DynamoDB:', jobs.length);
    
    // Cache the result
    await setCached(cacheKey, jobs, CACHE_TTL);

    return jobs;
  } catch (error: any) {
    // Table doesn't exist or other error - return empty array gracefully
    console.error('[getAllJobs] Error fetching jobs:', error?.message, error?.stack);
    return [];
  }
}

/**
 * Get jobs by status (Open, Paused, Filled, Lost, Closed — legacy values normalized)
 */
export async function getJobsByStatus(tenantId: string, status: string): Promise<Job[]> {
  const canonical = normalizeJobStatus(status);
  // Filter in memory so legacy values (On Hold, OPEN, …) still match
  const all = await getAllJobs(tenantId);
  return all.filter((j) => normalizeJobStatus(j.status) === canonical);
}

/**
 * Get open jobs for a tenant
 */
export async function getOpenJobs(tenantId: string): Promise<Job[]> {
  const allJobs = await getAllJobs(tenantId);
  return allJobs.filter((job) => normalizeJobStatus(job.status) === 'Open');
}

/**
 * Get a single job by ID
 */
export async function getJobById(tenantId: string, jobId: string): Promise<Job | null> {
  const cacheKey = makeCacheKey(tenantId, 'jobs', jobId);

  // Try cache first
  const cached = await getCached<Job>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get from DynamoDB
  const job = await getItem<Job>(jobsTable, {
    tenant_id: tenantId,
    id: jobId,
  });

  if (job) {
    await setCached(cacheKey, job, CACHE_TTL);
  }

  return job;
}

/**
 * Get all jobs for a specific company
 */
export async function getJobsForCompany(tenantId: string, companyId: string): Promise<Job[]> {
  const allJobs = await getAllJobs(tenantId);
  return allJobs.filter(job => job.companyId === companyId);
}

/**
 * Get all jobs where a candidate is linked
 */
export async function getJobsForCandidate(tenantId: string, candidateId: string): Promise<Job[]> {
  const allJobs = await getAllJobs(tenantId);
  return allJobs.filter(job => 
    job.candidates?.some(c => c.candidateId === candidateId)
  );
}

/**
 * Create a new job
 */
export async function createJob(tenantId: string, data: CreateJobInput): Promise<Job> {
  const now = new Date().toISOString();

  const job: Job = {
    id: generateId(),
    tenant_id: tenantId,
    title: data.title,
    description: data.description || '',
    location: data.location || '',
    salaryRange: data.salaryRange || '',
    employmentType: data.employmentType || 'Full-time',
    companyId: data.companyId,
    companyName: data.companyName,
    status: normalizeJobStatus(data.status || 'Open'),
    // New jobs default off the public site until recruiter opts in
    showOnWebsite: data.showOnWebsite === true,
    candidates: [],
    created_at: now,
    modified_at: now,
  };

  // Save to DynamoDB
  await putItem(jobsTable, job);

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  return job;
}

/**
 * Update a job
 */
export async function updateJob(
  tenantId: string,
  jobId: string,
  data: UpdateJobInput
): Promise<Job | null> {
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  if (data.title !== undefined) {
    updates.push('#title = :title');
    values[':title'] = data.title;
    names['#title'] = 'title';
  }
  if (data.description !== undefined) {
    updates.push('#description = :description');
    values[':description'] = data.description;
    names['#description'] = 'description';
  }
  if (data.location !== undefined) {
    updates.push('#location = :location');
    values[':location'] = data.location;
    names['#location'] = 'location';
  }
  if (data.salaryRange !== undefined) {
    updates.push('#salaryRange = :salaryRange');
    values[':salaryRange'] = data.salaryRange;
    names['#salaryRange'] = 'salaryRange';
  }
  if (data.employmentType !== undefined) {
    updates.push('#employmentType = :employmentType');
    values[':employmentType'] = data.employmentType;
    names['#employmentType'] = 'employmentType';
  }
  if (data.companyId !== undefined) {
    updates.push('#companyId = :companyId');
    values[':companyId'] = data.companyId;
    names['#companyId'] = 'companyId';
  }
  if (data.companyName !== undefined) {
    updates.push('#companyName = :companyName');
    values[':companyName'] = data.companyName;
    names['#companyName'] = 'companyName';
  }
  if (data.status !== undefined) {
    updates.push('#status = :status');
    values[':status'] = normalizeJobStatus(String(data.status));
    names['#status'] = 'status';
  }
  if (data.showOnWebsite !== undefined) {
    updates.push('#showOnWebsite = :showOnWebsite');
    values[':showOnWebsite'] = data.showOnWebsite === true;
    names['#showOnWebsite'] = 'showOnWebsite';
  }

  if (updates.length === 0) {
    return getJobById(tenantId, jobId);
  }

  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';

  const updated = await updateItem<Job>(
    jobsTable,
    { tenant_id: tenantId, id: jobId },
    `SET ${updates.join(', ')}`,
    values,
    names
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  return updated;
}

/**
 * Link a candidate to a job
 */
export async function linkCandidateToJob(
  tenantId: string,
  jobId: string,
  data: LinkCandidateInput | {
    candidateId: string;
    candidateName: string;
    candidateEmail?: string;
    stage?: string;
    notes?: string;
  },
  options?: { skipDualWrite?: boolean }
): Promise<Job | null> {
  // Bypass stale cache for accurate linked list
  const job = await getItem<Job>(jobsTable, {
    tenant_id: tenantId,
    id: jobId,
  });

  if (!job) {
    throw new Error('Job not found');
  }

  const existing =
    (Array.isArray(job.candidates) && job.candidates) ||
    (Array.isArray((job as any).linkedCandidates) && (job as any).linkedCandidates) ||
    [];

  // Check if candidate already linked
  if (existing.some((c: any) => c.candidateId === data.candidateId)) {
    throw new Error('Candidate already linked to this job');
  }

  // Add the new candidate to the array
  const newCandidate: LinkedCandidate = {
    candidateId: data.candidateId,
    candidateName: data.candidateName,
    candidateEmail: data.candidateEmail || '',
    // Accept application stages (sourced, etc.) — cast for storage flexibility
    stage: (data.stage || 'sourced') as any,
    dateApplied: new Date().toISOString(),
    notes: data.notes || '',
  };

  const nextCandidates = [...existing, newCandidate];

  const updated = await updateItem<Job>(
    jobsTable,
    { tenant_id: tenantId, id: jobId },
    'SET #candidates = :candidates, #modified_at = :modified_at',
    {
      ':candidates': nextCandidates,
      ':modified_at': new Date().toISOString(),
    },
    {
      '#candidates': 'candidates',
      '#modified_at': 'modified_at',
    }
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  // Dual-write: candidate.linkedJobs (skip when called from lead side)
  if (!options?.skipDualWrite) {
    try {
      const { linkCandidateToJobForApplication } = await import(
        "./lead-repository"
      );
      await linkCandidateToJobForApplication(
        tenantId,
        data.candidateId,
        jobId,
        job.title || "Job",
        (job as any).companyId || (job as any).company_id,
        (job as any).companyName || (job as any).company_name,
        data.stage || "sourced",
        { skipDualWrite: true }
      );
    } catch (err: any) {
      if (
        !String(err?.message || "")
          .toLowerCase()
          .includes("already linked")
      ) {
        console.warn("[linkCandidateToJob] lead dual-write:", err);
      }
    }
  }

  // Return fresh job with candidates array guaranteed
  return (
    updated || {
      ...job,
      candidates: nextCandidates,
      modified_at: new Date().toISOString(),
    }
  );
}

/**
 * Unlink a candidate from a job
 */
export async function unlinkCandidateFromJob(
  tenantId: string,
  jobId: string,
  candidateId: string,
  options?: { skipDualWrite?: boolean }
): Promise<Job | null> {
  const job = await getJobById(tenantId, jobId);
  
  if (!job) {
    throw new Error('Job not found');
  }

  // Remove the candidate from the array
  const updatedCandidates = (job.candidates || []).filter(
    c => c.candidateId !== candidateId
  );

  const updated = await updateItem<Job>(
    jobsTable,
    { tenant_id: tenantId, id: jobId },
    'SET #candidates = :candidates, #modified_at = :modified_at',
    {
      ':candidates': updatedCandidates,
      ':modified_at': new Date().toISOString(),
    },
    {
      '#candidates': 'candidates',
      '#modified_at': 'modified_at',
    }
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  if (!options?.skipDualWrite) {
    try {
      const { unlinkCandidateFromJobForApplication } = await import(
        "./lead-repository"
      );
      await unlinkCandidateFromJobForApplication(tenantId, candidateId, jobId, {
        skipDualWrite: true,
      });
    } catch (err) {
      console.warn("[unlinkCandidateFromJob] lead dual-write:", err);
    }
  }

  return updated;
}

/**
 * Update a candidate's stage in a job
 */
export async function updateCandidateStageInJob(
  tenantId: string,
  jobId: string,
  data: UpdateCandidateStageInput
): Promise<Job | null> {
  const job = await getJobById(tenantId, jobId);
  
  if (!job) {
    throw new Error('Job not found');
  }

  // Update the candidate's stage in the array
  const updatedCandidates = (job.candidates || []).map(c => {
    if (c.candidateId === data.candidateId) {
      return {
        ...c,
        stage: data.stage,
        notes: data.notes !== undefined ? data.notes : c.notes,
      };
    }
    return c;
  });

  const updated = await updateItem<Job>(
    jobsTable,
    { tenant_id: tenantId, id: jobId },
    'SET #candidates = :candidates, #modified_at = :modified_at',
    {
      ':candidates': updatedCandidates,
      ':modified_at': new Date().toISOString(),
    },
    {
      '#candidates': 'candidates',
      '#modified_at': 'modified_at',
    }
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  return updated;
}

/**
 * Delete a job
 */
export async function deleteJob(tenantId: string, jobId: string): Promise<void> {
  await deleteItem(jobsTable, { tenant_id: tenantId, id: jobId });

  // Invalidate cache
  await invalidateTenantCache(tenantId);
}

/**
 * Get count of candidates by stage for a job
 */
export async function getCandidateCountByStage(
  tenantId: string,
  jobId: string
): Promise<Record<string, number>> {
  const job = await getJobById(tenantId, jobId);
  
  if (!job) {
    return {};
  }

  const counts: Record<string, number> = {};
  
  for (const stage of jobCandidateStages) {
    counts[stage] = 0;
  }

  for (const candidate of job.candidates || []) {
    if (counts[candidate.stage] !== undefined) {
      counts[candidate.stage]++;
    }
  }

  return counts;
}

/**
 * Get job statistics for a tenant
 */
export async function getJobStats(tenantId: string): Promise<{
  totalJobs: number;
  openJobs: number;
  closedJobs: number;
  jobsWithCandidates: number;
  totalCandidateApplications: number;
}> {
  const allJobs = await getAllJobs(tenantId);

  let totalCandidateApplications = 0;
  let jobsWithCandidates = 0;

  for (const job of allJobs) {
    const candidateCount = job.candidates?.length || 0;
    totalCandidateApplications += candidateCount;
    if (candidateCount > 0) {
      jobsWithCandidates++;
    }
  }

  return {
    totalJobs: allJobs.length,
    openJobs: allJobs.filter(
      (j) => normalizeJobStatus(j.status) === 'Open'
    ).length,
    closedJobs: allJobs.filter((j) => {
      const s = normalizeJobStatus(j.status);
      return s === 'Closed' || s === 'Filled' || s === 'Lost';
    }).length,
    jobsWithCandidates,
    totalCandidateApplications,
  };
}
