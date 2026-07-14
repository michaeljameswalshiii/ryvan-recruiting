'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createIssueAction,
  listIssuesAction,
  getIssueAction,
  updateIssueAction,
  deleteIssueAction,
  addIssueCommentAction,
  addIssueAttachmentAction,
  removeIssueAttachmentAction,
} from '@/lib/actions/issue-actions';
import { CreateIssueInput } from '@/lib/schemas/issue';

export const issueKeys = {
  all: ['issues'] as const,
  list: (status?: string) => [...issueKeys.all, { status }] as const,
  detail: (id: string) => [...issueKeys.all, 'detail', id] as const,
};

function invalidateIssue(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: issueKeys.all });
  if (id) {
    queryClient.invalidateQueries({ queryKey: issueKeys.detail(id) });
  }
}

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

export function useIssue(id: string) {
  return useQuery({
    queryKey: issueKeys.detail(id),
    queryFn: async () => {
      const result = await getIssueAction(id);
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.issue) {
        throw new Error('Issue not found');
      }
      return result.issue;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 2,
    retry: 1,
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
      invalidateIssue(queryClient);
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
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateIssueInput>;
    }) => {
      const result = await updateIssueAction(id, data);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: (_data, variables) => {
      toast.success('Issue updated successfully');
      invalidateIssue(queryClient, variables.id);
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
      invalidateIssue(queryClient);
    },
    onError: (error) => {
      toast.error('Failed to delete issue', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

export function useAddIssueComment(issueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      const result = await addIssueCommentAction(issueId, body);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: () => {
      toast.success('Comment added');
      invalidateIssue(queryClient, issueId);
    },
    onError: (error) => {
      toast.error('Failed to add comment', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

export function useAddIssueAttachment(issueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const result = await addIssueAttachmentAction(issueId, formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: () => {
      toast.success('Attachment uploaded');
      invalidateIssue(queryClient, issueId);
    },
    onError: (error) => {
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

export function useRemoveIssueAttachment(issueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const result = await removeIssueAttachmentAction(issueId, attachmentId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: () => {
      toast.success('Attachment removed');
      invalidateIssue(queryClient, issueId);
    },
    onError: (error) => {
      toast.error('Failed to remove attachment', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
