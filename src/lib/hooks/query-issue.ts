'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createIssueAction, listIssuesAction, updateIssueAction, deleteIssueAction } from '@/lib/actions/issue-actions';
import { CreateIssueInput } from '@/lib/schemas/issue';

export const issueKeys = {
  all: ['issues'] as const,
  list: (status?: string) => [...issueKeys.all, { status }] as const,
  detail: (id: string) => [...issueKeys.all, id] as const,
};

export function useIssues(status?: string) {
  return useQuery({
    queryKey: issueKeys.list(status),
    queryFn: async () => {
      const result = await listIssuesAction(status);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issues || [];
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateIssueInput) => {
      const result = await createIssueAction(data);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: () => {
      toast.success('Issue created successfully');
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
    onError: (error) => {
toast.error('Failed to create issue', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateIssueInput> }) => {
      const result = await updateIssueAction(id, data);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: () => {
      toast.success('Issue updated successfully');
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
    onError: (error) => {
      toast.error('Failed to update issue', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteIssueAction(id);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.success;
    },
    onSuccess: () => {
      toast.success('Issue deleted successfully');
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
    onError: (error) => {
      toast.error('Failed to delete issue', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
