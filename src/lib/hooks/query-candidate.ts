/**
 * TanStack Query Hooks for Candidate Detail
 * Provides reactive data fetching for individual candidates
 * 
 * @clientOnly
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Lead } from '@/lib/schemas/lead';

// Query keys
export const candidateKeys = {
  all: ['candidates'] as const,
  details: () => [...candidateKeys.all, 'detail'] as const,
  detail: (id: string) => [...candidateKeys.details(), id] as const,
  events: (id: string) => [...candidateKeys.all, 'events', id] as const,
};

interface CandidateResponse {
  candidate: Lead;
}

/**
 * Get a single candidate by ID
 */
export async function getCandidate(id: string): Promise<Lead> {
  const response = await fetch(`/api/candidate/${id}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch candidate');
  }
  const data: CandidateResponse = await response.json();
  return data.candidate;
}

/**
 * Fetch candidate events
 */
export async function getCandidateEvents(id: string, limit = 20) {
  const response = await fetch(`/api/candidate/${id}/events?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch events');
  }
  const data = await response.json();
  return data.events || [];
}

/**
 * Add note to candidate
 */
export async function addNote(id: string, noteText: string, createdBy: string) {
  const response = await fetch(`/api/candidate/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noteText, createdBy }),
  });
  if (!response.ok) {
    throw new Error('Failed to add note');
  }
  return response.json();
}

/**
 * Use query hook for fetching a single candidate
 */
export function useCandidate(id: string) {
  return useQuery({
    queryKey: candidateKeys.detail(id),
    queryFn: () => getCandidate(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Use query hook for fetching candidate events
 */
export function useCandidateEvents(id: string) {
  return useQuery({
    queryKey: candidateKeys.events(id),
    queryFn: () => getCandidateEvents(id),
    enabled: !!id,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Use mutation hook for adding a note
 */
export function useAddNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, noteText, createdBy }: { id: string; noteText: string; createdBy: string }) => {
      return addNote(id, noteText, createdBy);
    },
    onSuccess: (_, variables) => {
      toast.success('Note added successfully');
      queryClient.invalidateQueries({ queryKey: candidateKeys.events(variables.id) });
    },
    onError: (error) => {
      toast.error('Failed to add note', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
