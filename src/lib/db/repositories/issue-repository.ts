import { v4 as uuidv4 } from 'uuid';
import { putItem, getItem, queryItems, updateItem, deleteItem, tableNames } from '../dynamodb';
import {
  CreateIssueInput,
  Issue,
  IssueAttachment,
  IssueComment,
} from '../../schemas/issue';

function generateIssueId(existingCount: number): string {
  return `ISS-${String(existingCount + 1).padStart(3, '0')}`;
}

async function countIssuesForTenant(tenantId: string): Promise<number> {
  const result = await queryItems<any>(
    tableNames.issues,
    'tenant_id = :tenantId',
    { ':tenantId': tenantId }
  );
  return result.items.length || 0;
}

function normalizeAttachment(raw: any): IssueAttachment {
  return {
    id: raw?.id || uuidv4(),
    url: raw?.url || '',
    s3Key: raw?.s3Key,
    name: raw?.name || 'file',
    type: raw?.type,
    size: typeof raw?.size === 'number' ? raw.size : undefined,
    uploadedBy: raw?.uploadedBy,
    uploadedByEmail: raw?.uploadedByEmail,
    uploadedAt: raw?.uploadedAt,
  };
}

function normalizeComment(raw: any): IssueComment {
  return {
    id: raw?.id || uuidv4(),
    body: raw?.body || raw?.text || '',
    authorId: raw?.authorId,
    authorName: raw?.authorName || raw?.author || 'User',
    authorEmail: raw?.authorEmail,
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

function mapItem(item: any): Issue {
  return {
    id: item.id,
    tenantId: item.tenant_id,
    issueId: item.issueId,
    title: item.title,
    description: item.description,
    issueType: item.issueType,
    priority: item.priority,
    severity: item.severity,
    mvp: item.mvp,
    featureArea: item.featureArea,
    status: item.status,
    reportedBy: item.reportedBy,
    assignedTo: item.assignedTo || [],
    environment: item.environment,
    tags: item.tags || [],
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map(normalizeAttachment)
      : [],
    comments: Array.isArray(item.comments)
      ? item.comments.map(normalizeComment)
      : [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const issueRepository = {
  async create(data: CreateIssueInput, tenantId: string): Promise<Issue> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const count = await countIssuesForTenant(tenantId);
    const issueId = data.issueId || generateIssueId(count);

    const issue: Issue = {
      id,
      tenantId,
      issueId,
      title: data.title,
      description: data.description,
      issueType: data.issueType,
      priority: data.priority,
      severity: data.severity,
      mvp: data.mvp,
      featureArea: data.featureArea,
      status: data.status || 'Open',
      reportedBy: data.reportedBy,
      assignedTo: data.assignedTo || [],
      environment: data.environment,
      tags: data.tags || [],
      attachments: (data.attachments || []).map(normalizeAttachment),
      comments: (data.comments || []).map(normalizeComment),
      createdAt: now,
      updatedAt: now,
    };

    await putItem(tableNames.issues, {
      tenant_id: tenantId,
      id: issue.id,
      issueId: issue.issueId,
      title: issue.title,
      description: issue.description,
      issueType: issue.issueType,
      priority: issue.priority,
      severity: issue.severity,
      mvp: issue.mvp,
      featureArea: issue.featureArea,
      status: issue.status,
      reportedBy: issue.reportedBy,
      assignedTo: issue.assignedTo,
      environment: issue.environment,
      tags: issue.tags,
      attachments: issue.attachments,
      comments: issue.comments,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    });

    return issue;
  },

  async getById(id: string, tenantId: string): Promise<Issue | null> {
    const item = await getItem<any>(tableNames.issues, {
      tenant_id: tenantId,
      id,
    });

    if (!item) return null;
    return mapItem(item);
  },

  async listByTenant(tenantId: string, status?: string): Promise<Issue[]> {
    const result = await queryItems<any>(
      tableNames.issues,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    let items = (result.items || []).map(mapItem);
    if (status && status.length > 0) {
      items = items.filter((i) => i.status === status);
    }
    // Newest first
    items.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    );
    return items;
  },

  async update(
    id: string,
    data: Partial<CreateIssueInput>,
    tenantId: string
  ): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const forbidden = new Set([
      'id',
      'tenantId',
      'tenant_id',
      'issueId',
      'createdAt',
      'updatedAt',
    ]);
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data || {})) {
      if (forbidden.has(key)) continue;
      if (value === undefined) continue;
      if (typeof value === 'string' && value.trim() === '') {
        cleaned[key] = null;
        continue;
      }
      cleaned[key] = value;
    }

    const updatedAt = new Date().toISOString();
    const keys = Object.keys(cleaned);
    const setParts = keys.map((key) => `#${key} = :${key}`);
    setParts.push('#updatedAt = :updatedAt');

    const expressionNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const expressionValues: Record<string, unknown> = { ':updatedAt': updatedAt };

    for (const key of keys) {
      expressionNames[`#${key}`] = key;
      expressionValues[`:${key}`] = cleaned[key];
    }

    await updateItem(
      tableNames.issues,
      { tenant_id: tenantId, id },
      `SET ${setParts.join(', ')}`,
      expressionValues,
      expressionNames
    );

    return this.getById(id, tenantId);
  },

  async addComment(
    id: string,
    tenantId: string,
    comment: Omit<IssueComment, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    }
  ): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const entry: IssueComment = {
      id: comment.id || uuidv4(),
      body: comment.body.trim(),
      authorId: comment.authorId,
      authorName: comment.authorName || 'User',
      authorEmail: comment.authorEmail,
      createdAt: comment.createdAt || new Date().toISOString(),
    };

    if (!entry.body) {
      throw new Error('Comment cannot be empty');
    }

    const comments = [...(existing.comments || []), entry];
    return this.update(id, { comments } as Partial<CreateIssueInput>, tenantId);
  },

  async addAttachment(
    id: string,
    tenantId: string,
    attachment: IssueAttachment
  ): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const attachments = [
      ...(existing.attachments || []),
      normalizeAttachment(attachment),
    ];
    return this.update(id, { attachments } as Partial<CreateIssueInput>, tenantId);
  },

  async removeAttachment(
    id: string,
    tenantId: string,
    attachmentId: string
  ): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const attachments = (existing.attachments || []).filter(
      (a) => a.id !== attachmentId
    );
    return this.update(id, { attachments } as Partial<CreateIssueInput>, tenantId);
  },

  async delete(id: string, tenantId: string): Promise<void> {
    await deleteItem(tableNames.issues, { tenant_id: tenantId, id });
  },
};
