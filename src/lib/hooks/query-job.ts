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
 * Includes loading and error states with retry
 */
export function useJobs(includeStats = false) {
  return useQuery({
    queryKey: includeStats ? [...jobKeys.lists(), { includeStats }] : jobKeys.lists(),
    queryFn: async () => {
      const url = includeStats ? '/api/data/jobs?includeStats=true' : '/api/data/jobs';
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to fetch jobs');
      }
      const result = await response.json();
      return includeStats ? { jobs: result.jobs, stats: result.stats } : result.jobs;
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
      const response = await fetch(`/api/data/jobs/${jobId}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to fetch job');
      }
      const result = await response.json();
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
      const response = await fetch('/api/data/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create job');
      }
      return response.json();
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
      const response = await fetch(`/api/data/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update job');
      }
      return response.json();
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
      const response = await fetch(`/api/data/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to delete job');
      }
      return response.json();
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
      const response = await fetch(`/api/data/jobs/${jobId}/link-candidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(candidateData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to link candidate');
      }
      return response.json();
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
      const response = await fetch(`/api/data/jobs/${jobId}/link-candidate?candidateId=${candidateId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to unlink candidate');
      }
      return response.json();
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
      const response = await fetch(`/api/data/jobs/${jobId}/update-stage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ candidateId, stage, notes }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update stage');
      }
      return response.json();
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
 * Get all jobs for a specific candidate
 * Returns jobs where this candidate has been linked
 */
export function useJobsForCandidate(candidateId: string) {
  return useQuery({
    queryKey: ['jobs', 'for-candidate', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      const response = await fetch(`/api/data/jobs/for-candidate/${candidateId}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to fetch jobs for candidate');
      }
      const result = await response.json();
      return result.jobs || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
    enabled: !!candidateId,
  });
}

/**
 * Get all open jobs for a specific company
 * Returns jobs linked to this company
 */
export function useJobsForCompany(companyId: string) {
  return useQuery({
    queryKey: ['jobs', 'for-company', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const response = await fetch(`/api/data/jobs/for-company/${companyId}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to fetch jobs for company');
      }
      const result = await response.json();
      return result.jobs || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
    enabled: !!companyId,
  });
}
