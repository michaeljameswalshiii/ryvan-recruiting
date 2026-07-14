import { v4 as uuidv4 } from 'uuid';
import { putItem, getItem, queryItems, updateItem, deleteItem, tableNames } from '../dynamodb';
import { CreateIssueInput, Issue } from '../../schemas/issue';

const ISSUES_GSI = 'TenantStatusIndex';

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
      attachments: data.attachments || [],
      comments: data.comments || [],
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
      attachments: item.attachments || [],
      comments: item.comments || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  },

  async listByTenant(tenantId: string, status?: string): Promise<Issue[]> {
    const result =
      status && status.length > 0
        ? await queryItems<any>(
            tableNames.issues,
            'tenant_id = :tenantId',
            { ':tenantId': tenantId },
            {
              expressionNames: { '#status': 'status' },
            }
          )
        : await queryItems<any>(
            tableNames.issues,
            'tenant_id = :tenantId',
            { ':tenantId': tenantId }
          );

return (result.items || []).map((item: any) => ({
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
      attachments: item.attachments || [],
      comments: item.comments || [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  },

async update(id: string, data: Partial<CreateIssueInput>, tenantId: string): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    // Never write primary/system fields via partial update
    const forbidden = new Set(['id', 'tenantId', 'tenant_id', 'issueId', 'createdAt', 'updatedAt']);
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data || {})) {
      if (forbidden.has(key)) continue;
      if (value === undefined) continue;
      // DynamoDB rejects empty strings for some attribute shapes; store null-ish as omit
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

  async delete(id: string, tenantId: string): Promise<void> {
    await deleteItem(tableNames.issues, { tenant_id: tenantId, id });
  },
};
