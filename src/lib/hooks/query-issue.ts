"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createIssueAction,
  listIssuesAction,
  getIssueAction,
  updateIssueAction,
  updateIssueStatusAction,
  deleteIssueAction,
  addIssueCommentAction,
  addIssueAttachmentAction,
  removeIssueAttachmentAction,
} from "@/lib/actions/issue-actions";
import type { CreateIssueInput, Issue, IssueListFilters } from "@/lib/schemas/issue";

export const issueKeys = {
  all: ["issues"] as const,
  list: (filters?: IssueListFilters | string) =>
    [...issueKeys.all, "list", filters || {}] as const,
  detail: (id: string) => [...issueKeys.all, "detail", id] as const,
};

function invalidateIssue(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string
) {
  queryClient.invalidateQueries({ queryKey: issueKeys.all, refetchType: "active" });
  if (id) {
    queryClient.invalidateQueries({
      queryKey: issueKeys.detail(id),
      refetchType: "active",
    });
  }
}

export function useIssues(filters?: IssueListFilters | string) {
  return useQuery({
    queryKey: issueKeys.list(filters),
    queryFn: async () => {
      const result = await listIssuesAction(filters);
      if (result.error) {
        throw new Error(result.error);
      }
      return (result.issues || []) as Issue[];
    },
    staleTime: 0,
    refetchOnMount: "always",
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
        throw new Error("Issue not found");
      }
      return result.issue as Issue;
    },
    enabled: !!id,
    staleTime: 0,
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
      return result.issue as Issue;
    },
    onSuccess: (issue) => {
      toast.success("Issue created");
      if (issue) {
        queryClient.setQueryData(issueKeys.list({}), (prev: Issue[] | undefined) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((i) => i.id === issue.id)) return list;
          return [issue, ...list];
        });
      }
      invalidateIssue(queryClient);
    },
    onError: (error) => {
      toast.error("Failed to create issue", {
        description:
          error instanceof Error ? error.message : "Please try again",
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
      return result.issue as Issue;
    },
    onSuccess: (issue, variables) => {
      toast.success("Issue updated");
      if (issue) {
        queryClient.setQueryData(issueKeys.detail(variables.id), issue);
      }
      invalidateIssue(queryClient, variables.id);
    },
    onError: (error) => {
      toast.error("Failed to update issue", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    },
  });
}

export function useUpdateIssueStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const result = await updateIssueStatusAction(id, status);
      if (result.error) throw new Error(result.error);
      return result.issue as Issue;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.all });
      const snapshots: Array<{ key: unknown; data: unknown }> = [];
      const cache = queryClient.getQueriesData({ queryKey: issueKeys.all });
      for (const [key, data] of cache) {
        snapshots.push({ key, data });
        if (Array.isArray(data)) {
          queryClient.setQueryData(
            key,
            data.map((i: Issue) =>
              i.id === id ? { ...i, status: status as Issue["status"] } : i
            )
          );
        }
      }
      return { snapshots };
    },
    onSuccess: (issue, variables) => {
      if (issue) {
        queryClient.setQueryData(issueKeys.detail(variables.id), issue);
      }
      invalidateIssue(queryClient, variables.id);
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshots) {
        for (const s of ctx.snapshots) {
          queryClient.setQueryData(s.key as any, s.data);
        }
      }
      toast.error("Failed to move issue", {
        description:
          error instanceof Error ? error.message : "Please try again",
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
      toast.success("Issue deleted");
      invalidateIssue(queryClient);
    },
    onError: (error) => {
      toast.error("Failed to delete issue", {
        description:
          error instanceof Error ? error.message : "Please try again",
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
      toast.success("Comment added");
      invalidateIssue(queryClient, issueId);
    },
    onError: (error) => {
      toast.error("Failed to add comment", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    },
  });
}

export function useAddIssueAttachment(issueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await addIssueAttachmentAction(issueId, formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.issue;
    },
    onSuccess: () => {
      toast.success("Attachment uploaded");
      invalidateIssue(queryClient, issueId);
    },
    onError: (error) => {
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "Please try again",
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
      toast.success("Attachment removed");
      invalidateIssue(queryClient, issueId);
    },
    onError: (error) => {
      toast.error("Failed to remove attachment", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    },
  });
}
