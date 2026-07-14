'use server';

import { revalidatePath } from 'next/cache';
import { getSessionTenantId } from '../server-auth';
import { issueRepository } from '../db/repositories/issue-repository';
import { CreateIssueInput } from '../schemas/issue';

export async function createIssueAction(data: CreateIssueInput) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const issue = await issueRepository.create(data, tenantId);
    revalidatePath('/dashboard/issues');
    return { issue };
  } catch (error: any) {
    return { error: error?.message || 'Failed to create issue' };
  }
}

export async function listIssuesAction(status?: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { issues: [] };
  }

  try {
    const issues = await issueRepository.listByTenant(tenantId, status);
    return { issues };
  } catch (error: any) {
    return { error: error?.message || 'Failed to list issues' };
  }
}

export async function getIssueAction(id: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const issue = await issueRepository.getById(id, tenantId);
    return { issue };
  } catch (error: any) {
    return { error: error?.message || 'Failed to get issue' };
  }
}

export async function updateIssueAction(id: string, data: Partial<CreateIssueInput>) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  if (!id) {
    return { error: 'Issue id is required' };
  }

  try {
    // Only pass known updatable fields (avoids serializing junk / forbidden keys)
    const payload: Partial<CreateIssueInput> = {
      title: data.title,
      description: data.description,
      issueType: data.issueType,
      priority: data.priority,
      severity: data.severity,
      mvp: data.mvp,
      featureArea: data.featureArea,
      status: data.status,
      reportedBy: data.reportedBy,
      assignedTo: data.assignedTo,
      environment: data.environment,
      tags: data.tags,
      attachments: data.attachments,
      comments: data.comments,
    };

    const issue = await issueRepository.update(id, payload, tenantId);
    if (!issue) {
      return { error: 'Issue not found' };
    }
    revalidatePath('/dashboard/issues');
    revalidatePath(`/dashboard/issues/${id}`);
    return { issue };
  } catch (error: any) {
    console.error('[updateIssueAction]', id, error);
    return { error: error?.message || 'Failed to update issue' };
  }
}

export async function deleteIssueAction(id: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    await issueRepository.delete(id, tenantId);
    revalidatePath('/dashboard/issues');
    return { success: true };
  } catch (error: any) {
    return { error: error?.message || 'Failed to delete issue' };
  }
}
