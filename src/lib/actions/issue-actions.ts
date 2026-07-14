'use server';

import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import {
  getSessionTenantId,
  getSessionUserId,
  getSessionUserEmail,
} from '../server-auth';
import { issueRepository } from '../db/repositories/issue-repository';
import { CreateIssueInput, IssueAttachment } from '../schemas/issue';
import {
  getIssueAttachmentUrl,
  storeIssueAttachment,
} from '../aws/issue-attachments';

function revalidateIssue(id: string) {
  revalidatePath('/dashboard/issues');
  revalidatePath(`/dashboard/issues/${id}`);
}

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
    if (!issue) return { issue: null };

    // Refresh presigned URLs for S3 attachments
    const attachments = await Promise.all(
      (issue.attachments || []).map(async (a) => {
        if (a.s3Key) {
          try {
            const url = await getIssueAttachmentUrl(a.s3Key);
            return { ...a, url };
          } catch {
            return a;
          }
        }
        return a;
      })
    );

    return { issue: { ...issue, attachments } };
  } catch (error: any) {
    return { error: error?.message || 'Failed to get issue' };
  }
}

export async function updateIssueAction(
  id: string,
  data: Partial<CreateIssueInput>
) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  if (!id) {
    return { error: 'Issue id is required' };
  }

  try {
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
    revalidateIssue(id);
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

export async function addIssueCommentAction(id: string, body: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  const text = (body || '').trim();
  if (!text) {
    return { error: 'Comment cannot be empty' };
  }
  if (text.length > 5000) {
    return { error: 'Comment is too long (max 5000 characters)' };
  }

  try {
    const [userId, email] = await Promise.all([
      getSessionUserId(),
      getSessionUserEmail(),
    ]);
    const authorName =
      email?.split('@')[0]?.replace(/[._]/g, ' ') ||
      userId ||
      'User';

    const issue = await issueRepository.addComment(id, tenantId, {
      body: text,
      authorId: userId || undefined,
      authorName: authorName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      authorEmail: email || undefined,
    });

    if (!issue) return { error: 'Issue not found' };
    revalidateIssue(id);
    return { issue };
  } catch (error: any) {
    console.error('[addIssueCommentAction]', id, error);
    return { error: error?.message || 'Failed to add comment' };
  }
}

export async function addIssueAttachmentAction(id: string, formData: FormData) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return { error: 'No file provided' };
    }

    const [userId, email] = await Promise.all([
      getSessionUserId(),
      getSessionUserEmail(),
    ]);

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeIssueAttachment({
      buffer,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      tenantId,
      issueId: id,
    });

    const attachment: IssueAttachment = {
      id: uuidv4(),
      url: stored.url,
      s3Key: stored.s3Key,
      name: stored.name,
      type: stored.type,
      size: stored.size,
      uploadedBy: userId || undefined,
      uploadedByEmail: email || undefined,
      uploadedAt: new Date().toISOString(),
    };

    const issue = await issueRepository.addAttachment(id, tenantId, attachment);
    if (!issue) return { error: 'Issue not found' };
    revalidateIssue(id);
    return { issue, attachment };
  } catch (error: any) {
    console.error('[addIssueAttachmentAction]', id, error);
    return { error: error?.message || 'Failed to upload attachment' };
  }
}

export async function removeIssueAttachmentAction(
  id: string,
  attachmentId: string
) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const issue = await issueRepository.removeAttachment(
      id,
      tenantId,
      attachmentId
    );
    if (!issue) return { error: 'Issue not found' };
    revalidateIssue(id);
    return { issue };
  } catch (error: any) {
    return { error: error?.message || 'Failed to remove attachment' };
  }
}
