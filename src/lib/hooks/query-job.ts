/**
 * TanStack Query Hooks for Job Data
 * Provides reactive data fetching with caching, loading states, and error handling
 * Includes toast notifications for user feedback
 * 
 * @clientOnly
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  getJobs, 
  getJobByIdAction, 
  createJobAction, 
  updateJobAction, 
  deleteJobAction,
  linkCandidateToJobAction,
  unlinkCandidateFromJobAction,
  updateCandidateStageAction
} from '@/lib/actions/job-actions';

// Query keys - used for cache invalidation
export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...jobKeys.lists(), { filters }] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  stats: () => [...jobKeys.all, 'stats'] as const,
};

/**
 * Get all jobs for the current tenant
 * Uses server action for proper session handling
 */
export function useJobs(includeStats = false) {
  return useQuery({
    queryKey: includeStats ? [...jobKeys.lists(), { includeStats }] : jobKeys.lists(),
    queryFn: async () => {
      console.log('[useJobs] Fetching jobs...');
      const result = await getJobs(includeStats);
      console.log('[useJobs] Raw result:', JSON.stringify(result).slice(0, 1000));
      
      // If there's an error, throw it
      if (result.error) {
        console.error('[useJobs] Server error:', result.error);
        throw new Error(result.error);
      }
      
      // Return the jobs - empty array is OK, not an error
      const jobs = result.jobs || [];
      console.log('[useJobs] Jobs count:', jobs.length, 'Stats:', result.stats);
      
      return includeStats ? { jobs, stats: result.stats } : jobs;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}

/**
 * Get a single job by ID
 */
export function useJob(jobId: string) {
  return useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: async () => {
      const result = await getJobByIdAction(jobId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.job;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
    enabled: !!jobId,
  });
}

/**
 * Create a new job
 * Invalidates job list cache on success + shows toast
 */
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobData: {
      title: string;
      description?: string;
      location?: string;
      salaryRange?: string;
      employmentType?: string;
      companyId: string;
      companyName: string;
      status?: string;
    }) => {
      const formData = new FormData();
      formData.set('title', jobData.title);
      if (jobData.description) formData.set('description', jobData.description);
      if (jobData.location) formData.set('location', jobData.location);
      if (jobData.salaryRange) formData.set('salaryRange', jobData.salaryRange);
      if (jobData.employmentType) formData.set('employmentType', jobData.employmentType);
      formData.set('companyId', jobData.companyId);
      formData.set('companyName', jobData.companyName);
      if (jobData.status) formData.set('status', jobData.status);
      
      const result = await createJobAction(formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Job created successfully');
      queryClient.invalidateQueries({ queryKey: jobKeys.lists(), refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: jobKeys.stats(), refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' });
    },
    onError: (error) => {
      toast.error('Failed to create job', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Update an existing job
 * Invalidates both list and detail cache + shows toast
 */
export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      jobId, 
      jobData 
    }: { 
      jobId: string; 
      jobData: {
        title?: string;
        description?: string;
        location?: string;
        salaryRange?: string;
        employmentType?: string;
        companyId?: string;
        companyName?: string;
        status?: string;
      };
    }) => {
      const formData = new FormData();
      if (jobData.title) formData.set('title', jobData.title);
      if (jobData.description) formData.set('description', jobData.description);
      if (jobData.location) formData.set('location', jobData.location);
      if (jobData.salaryRange) formData.set('salaryRange', jobData.salaryRange);
      if (jobData.employmentType) formData.set('employmentType', jobData.employmentType);
      if (jobData.companyId) formData.set('companyId', jobData.companyId);
      if (jobData.companyName) formData.set('companyName', jobData.companyName);
      if (jobData.status) formData.set('status', jobData.status);
      
      const result = await updateJobAction(jobId, formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Job updated successfully');
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(variables.jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.stats() });
    },
    onError: (error) => {
      toast.error('Failed to update job', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Delete a job
 * Removes from cache on success + shows toast
 */
export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const result = await deleteJobAction(jobId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Job deleted successfully');
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: jobKeys.stats() });
    },
    onError: (error) => {
      toast.error('Failed to delete job', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Link a candidate to a job
 * Invalidates job cache + shows toast
 */
export function useLinkCandidateToJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      jobId, 
      candidateData 
    }: { 
      jobId: string; 
      candidateData: {
        candidateId: string;
        candidateName: string;
        candidateEmail?: string;
        stage?: string;
        notes?: string;
      };
    }) => {
      const result = await linkCandidateToJobAction(jobId, candidateData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Candidate linked to job');
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(variables.jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.stats() });
    },
    onError: (error) => {
      toast.error('Failed to link candidate', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Unlink a candidate from a job
 * Invalidates job cache + shows toast
 */
export function useUnlinkCandidateFromJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, candidateId }: { jobId: string; candidateId: string }) => {
      const result = await unlinkCandidateFromJobAction(jobId, candidateId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Candidate unlinked from job');
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(variables.jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.stats() });
    },
    onError: (error) => {
      toast.error('Failed to unlink candidate', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Update a candidate's stage in a job
 * Used for drag-and-drop within job's candidate list
 */
export function useUpdateCandidateStageInJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      jobId, 
      candidateId, 
      stage,
      notes 
    }: { 
      jobId: string; 
      candidateId: string; 
      stage: string;
      notes?: string;
    }) => {
      const result = await updateCandidateStageAction(jobId, candidateId, stage, notes);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success(`Candidate moved to ${variables.stage}`);
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(variables.jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.stats() });
    },
    onError: (error) => {
      toast.error('Failed to update stage', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Get jobs linked to a specific candidate
 * Used in CandidateDetailClient to show linked jobs
 */
export function useJobsForCandidate(candidateId: string) {
  return useQuery({
    queryKey: [...jobKeys.lists(), { candidateId }],
    queryFn: async () => {
      const result = await getJobs(false);
      if (result.error) {
        throw new Error(result.error);
      }
      // Filter jobs that have this candidate linked (use 'candidates' field as per schema)
      const jobs = (result.jobs || []).filter((job: any) => 
        job.candidates?.some((lc: any) => lc.candidateId === candidateId)
      );
      return jobs;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
    enabled: !!candidateId,
  });
}

/**
 * Get jobs for a specific company
 * Used in company detail page to show company's open jobs
 */
export function useJobsForCompany(companyId: string) {
  return useQuery({
    queryKey: [...jobKeys.lists(), { companyId }],
    queryFn: async () => {
      const result = await getJobs(false);
      if (result.error) {
        throw new Error(result.error);
      }
      // Filter jobs for this company
      const jobs = (result.jobs || []).filter((job: any) => 
        job.companyId === companyId
      );
      return jobs;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
    enabled: !!companyId,
  });
}

// ============================================================================
// NEW: Application-Centric Model Hooks
// ============================================================================

/**
 * Update candidate stage in a specific job (application-centric)
 * Uses the new linkedJobs[] structure on the candidate
 */
export function useUpdateCandidateStageInJobAppCentric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      candidateId, 
      jobId, 
      stage 
    }: { 
      candidateId: string; 
      jobId: string; 
      stage: string;
    }) => {
      // Call the server action for application-centric update
      const response = await fetch(`/api/data/leads/${candidateId}/job/${jobId}/stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success(`Stage updated to ${variables.stage}`);
      // Invalidate candidate and jobs caches
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to update stage', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Add a job-specific note to a candidate's application
 */
export function useAddJobSpecificNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      candidateId, 
      jobId, 
      noteContent,
      relatedStage
    }: { 
      candidateId: string; 
      jobId: string; 
      noteContent: string;
      relatedStage?: string;
    }) => {
      const response = await fetch(`/api/data/leads/${candidateId}/job/${jobId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: noteContent,
          relatedStage 
        }),
      });
      
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Note added');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      toast.error('Failed to add note', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Link a candidate to a job (application-centric model)
 */
export function useLinkCandidateToJobAppCentric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      candidateId,
      jobId, 
      jobTitle,
      companyId,
      companyName,
      initialStage = 'sourced'
    }: { 
      candidateId: string;
      jobId: string; 
      jobTitle: string;
      companyId?: string;
      companyName?: string;
      initialStage?: string;
    }) => {
      const response = await fetch(`/api/data/leads/${candidateId}/job/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jobId,
          jobTitle,
          companyId,
          companyName,
          initialStage
        }),
      });
      
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Job linked to candidate');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to link job', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Unlink a candidate from a job (application-centric model)
 */
export function useUnlinkCandidateFromJobAppCentric() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      candidateId,
      jobId
    }: { 
      candidateId: string;
      jobId: string;
    }) => {
      const response = await fetch(`/api/data/leads/${candidateId}/job/${jobId}/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Job unlinked from candidate');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to unlink job', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Get linked jobs for a specific candidate (application-centric)
 * Reads from candidate's linkedJobs[] data
 */
export function useLinkedJobsForCandidate(candidateId: string) {
  return useQuery({
    queryKey: ['linkedJobsForCandidate', candidateId],
    queryFn: async () => {
      // Get the candidate's data including linkedJobs
      const response = await fetch(`/api/data/leads/${candidateId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch candidate data');
      }
      
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Return the linkedJobs array from the candidate record
      return data.lead?.linkedJobs || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
    enabled: !!candidateId,
  });
}
