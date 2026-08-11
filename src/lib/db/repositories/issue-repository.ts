import { v4 as uuidv4 } from "uuid";
import {
  putItem,
  getItem,
  queryItems,
  updateItem,
  deleteItem,
  tableNames,
} from "../dynamodb";
import {
  CreateIssueInput,
  Issue,
  IssueAttachment,
  IssueComment,
  IssueHistoryEvent,
  IssueListFilters,
  normalizeIssueStatus,
  normalizeIssueType,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
} from "../../schemas/issue";

const MAX_HISTORY = 50;

function generateIssueId(existingCount: number, prefix = "ISS"): string {
  const p = String(prefix || "ISS")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8) || "ISS";
  return `${p}-${String(existingCount + 1).padStart(3, "0")}`;
}

/** Lexicographic rank between neighbors (simple fractional indexing). */
export function rankBetween(before?: string | null, after?: string | null): string {
  const a = before || "";
  const b = after || "";
  if (!a && !b) return "m";
  if (!a) return "a" + b;
  if (!b) return a + "m";
  // Find first differing char and pick mid letter when possible
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ca = a.charCodeAt(i) || 97;
  const cb = b.charCodeAt(i) || 122;
  if (cb - ca > 1) {
    const mid = String.fromCharCode(Math.floor((ca + cb) / 2));
    return a.slice(0, i) + mid;
  }
  return a + "m";
}

async function countIssuesForTenant(tenantId: string): Promise<number> {
  const result = await queryItems<any>(
    tableNames.issues,
    "tenant_id = :tenantId",
    { ":tenantId": tenantId }
  );
  return result.items.length || 0;
}

/** Highest numeric suffix among keys with this prefix (for stable next number). */
function nextIssueNumber(items: any[], prefix: string): number {
  const p = prefix.toUpperCase() + "-";
  let max = 0;
  for (const it of items) {
    const key = String(it.issueId || "");
    if (!key.toUpperCase().startsWith(p)) continue;
    const n = parseInt(key.slice(p.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function normalizeAttachment(raw: any): IssueAttachment {
  return {
    id: raw?.id || uuidv4(),
    url: raw?.url || "",
    s3Key: raw?.s3Key,
    name: raw?.name || "file",
    type: raw?.type,
    size: typeof raw?.size === "number" ? raw.size : undefined,
    uploadedBy: raw?.uploadedBy,
    uploadedByEmail: raw?.uploadedByEmail,
    uploadedAt: raw?.uploadedAt,
  };
}

function normalizeComment(raw: any): IssueComment {
  return {
    id: raw?.id || uuidv4(),
    body: raw?.body || raw?.text || "",
    authorId: raw?.authorId,
    authorName: raw?.authorName || raw?.author || "User",
    authorEmail: raw?.authorEmail,
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

function normalizeHistory(raw: any): IssueHistoryEvent {
  return {
    id: raw?.id || uuidv4(),
    action: raw?.action || "updated",
    at: raw?.at || raw?.createdAt || new Date().toISOString(),
    byId: raw?.byId,
    byName: raw?.byName,
    from: raw?.from,
    to: raw?.to,
    summary: raw?.summary,
  };
}

function mapItem(item: any): Issue {
  const assignedTo = Array.isArray(item.assignedTo) ? item.assignedTo : [];
  const assigneeName =
    item.assigneeName ||
    (assignedTo.length ? String(assignedTo[0]) : undefined);
  return {
    id: item.id,
    tenantId: item.tenant_id,
    issueId: item.issueId,
    title: item.title,
    description: item.description,
    issueType: normalizeIssueType(item.issueType) as IssueType,
    priority: (Number(item.priority) || 3) as IssuePriority,
    severity: item.severity,
    mvp: item.mvp,
    featureArea: item.featureArea,
    status: normalizeIssueStatus(item.status),
    reportedBy: item.reportedBy,
    reporterId: item.reporterId,
    reporterName: item.reporterName || item.reportedBy,
    assignedTo,
    assigneeId: item.assigneeId,
    assigneeName,
    environment: item.environment,
    tags: item.tags || [],
    customerRequest: !!item.customerRequest,
    customerName: item.customerName || undefined,
    dueDate: item.dueDate,
    storyPoints:
      typeof item.storyPoints === "number" ? item.storyPoints : undefined,
    linkedEntity: item.linkedEntity,
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map(normalizeAttachment)
      : [],
    comments: Array.isArray(item.comments)
      ? item.comments.map(normalizeComment)
      : [],
    history: Array.isArray(item.history)
      ? item.history.map(normalizeHistory)
      : [],
    rank: item.rank,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function appendHistory(
  existing: IssueHistoryEvent[] | undefined,
  event: Omit<IssueHistoryEvent, "id" | "at"> & { id?: string; at?: string }
): IssueHistoryEvent[] {
  const entry: IssueHistoryEvent = {
    id: event.id || uuidv4(),
    action: event.action,
    at: event.at || new Date().toISOString(),
    byId: event.byId,
    byName: event.byName,
    from: event.from,
    to: event.to,
    summary: event.summary,
  };
  const next = [...(existing || []), entry];
  return next.slice(-MAX_HISTORY);
}

function toDbItem(issue: Issue, tenantId: string) {
  return {
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
    reporterId: issue.reporterId,
    reporterName: issue.reporterName,
    assignedTo: issue.assignedTo || [],
    assigneeId: issue.assigneeId,
    assigneeName: issue.assigneeName,
    environment: issue.environment,
    tags: issue.tags || [],
    customerRequest: !!issue.customerRequest,
    customerName: issue.customerName,
    dueDate: issue.dueDate,
    storyPoints: issue.storyPoints,
    linkedEntity: issue.linkedEntity,
    attachments: issue.attachments || [],
    comments: issue.comments || [],
    history: issue.history || [],
    rank: issue.rank,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

export type HistoryActor = {
  byId?: string;
  byName?: string;
};

export const issueRepository = {
  async create(
    data: CreateIssueInput,
    tenantId: string,
    actor?: HistoryActor,
    opts?: { keyPrefix?: string }
  ): Promise<Issue> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const prefix = opts?.keyPrefix || "ISS";
    let issueId = data.issueId;
    if (!issueId) {
      const existing = await queryItems<any>(
        tableNames.issues,
        "tenant_id = :tenantId",
        { ":tenantId": tenantId }
      );
      const num = nextIssueNumber(existing.items || [], prefix);
      issueId = generateIssueId(num - 1, prefix);
    }

    const assigneeName =
      data.assigneeName ||
      (Array.isArray(data.assignedTo) && data.assignedTo[0]
        ? String(data.assignedTo[0])
        : undefined);

    const history = appendHistory([], {
      action: "created",
      byId: actor?.byId,
      byName: actor?.byName || data.reporterName || data.reportedBy,
      summary: "Issue created",
      at: now,
    });

    const issue: Issue = {
      id,
      tenantId,
      issueId,
      title: data.title,
      description: data.description,
      issueType: normalizeIssueType(data.issueType) as IssueType,
      priority: (data.priority || 3) as IssuePriority,
      severity: data.severity,
      mvp: data.mvp,
      featureArea: data.featureArea,
      status: normalizeIssueStatus(data.status || "Open"),
      reportedBy: data.reportedBy,
      reporterId: data.reporterId,
      reporterName: data.reporterName || data.reportedBy,
      assignedTo: data.assignedTo || (assigneeName ? [assigneeName] : []),
      assigneeId: data.assigneeId,
      assigneeName,
      environment: data.environment,
      tags: data.tags || [],
      customerRequest: !!data.customerRequest,
      customerName: data.customerName?.trim() || undefined,
      dueDate: data.dueDate,
      storyPoints: data.storyPoints,
      linkedEntity: data.linkedEntity,
      attachments: (data.attachments || []).map(normalizeAttachment),
      comments: (data.comments || []).map(normalizeComment),
      history,
      rank: data.rank || `${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(tableNames.issues, toDbItem(issue, tenantId));
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

  async listByTenant(
    tenantId: string,
    filters?: IssueListFilters | string
  ): Promise<Issue[]> {
    // Legacy: second arg was status string
    const f: IssueListFilters =
      typeof filters === "string"
        ? { status: filters }
        : filters || {};

    const result = await queryItems<any>(
      tableNames.issues,
      "tenant_id = :tenantId",
      { ":tenantId": tenantId }
    );

    let items = (result.items || []).map(mapItem);

    if (f.status) {
      const st = normalizeIssueStatus(f.status);
      items = items.filter((i) => i.status === st);
    }
    if (f.type) {
      const ty = normalizeIssueType(f.type);
      items = items.filter((i) => normalizeIssueType(i.issueType) === ty);
    }
    if (f.priority) {
      items = items.filter((i) => Number(i.priority) === Number(f.priority));
    }
    if (f.assignee) {
      const a = f.assignee.toLowerCase();
      items = items.filter(
        (i) =>
          String(i.assigneeName || "")
            .toLowerCase()
            .includes(a) ||
          String(i.assigneeId || "")
            .toLowerCase()
            .includes(a) ||
          (i.assignedTo || []).some((x) =>
            String(x).toLowerCase().includes(a)
          )
      );
    }
    if (f.customerRequest) {
      items = items.filter((i) => !!i.customerRequest);
    }
    if (f.q) {
      const q = f.q.toLowerCase();
      items = items.filter(
        (i) =>
          i.title?.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.issueId?.toLowerCase().includes(q) ||
          String(i.customerName || "")
            .toLowerCase()
            .includes(q) ||
          (i.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (f.mine) {
      const uid = (f.mineUserId || "").toLowerCase();
      const email = (f.mineEmail || "").toLowerCase();
      const name = (f.mineName || "").toLowerCase();
      items = items.filter((i) => {
        const an = String(i.assigneeName || "").toLowerCase();
        const aid = String(i.assigneeId || "").toLowerCase();
        const assigned = (i.assignedTo || []).map((x) => String(x).toLowerCase());
        if (uid && (aid === uid || assigned.includes(uid))) return true;
        if (email && (an.includes(email) || assigned.some((x) => x.includes(email))))
          return true;
        if (name && (an.includes(name) || assigned.some((x) => x.includes(name))))
          return true;
        return false;
      });
    }

    // Rank first when present, else updatedAt
    items.sort((a, b) => {
      const ra = a.rank || "";
      const rb = b.rank || "";
      if (ra && rb && ra !== rb) return ra < rb ? -1 : 1;
      if (ra && !rb) return -1;
      if (!ra && rb) return 1;
      return (
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
      );
    });
    return items;
  },

  /**
   * Reorder issues by explicit id list (backlog drag). Assigns sequential ranks.
   */
  async reorder(
    tenantId: string,
    orderedIds: string[]
  ): Promise<Issue[]> {
    const updates: Issue[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const rank = String(i).padStart(8, "0");
      const issue = await this.update(id, { rank } as Partial<CreateIssueInput>, tenantId);
      if (issue) updates.push(issue);
    }
    return updates;
  },

  /**
   * Bulk status change for selected ids.
   */
  async bulkUpdateStatus(
    tenantId: string,
    ids: string[],
    status: string,
    actor?: HistoryActor
  ): Promise<{ updated: number; issues: Issue[] }> {
    const st = normalizeIssueStatus(status);
    const issues: Issue[] = [];
    for (const id of ids) {
      const issue = await this.updateStatus(id, st, tenantId, actor);
      if (issue) issues.push(issue);
    }
    return { updated: issues.length, issues };
  },

  async update(
    id: string,
    data: Partial<CreateIssueInput>,
    tenantId: string,
    actor?: HistoryActor
  ): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    let history = existing.history || [];

    if (data.status !== undefined) {
      const next = normalizeIssueStatus(data.status);
      if (next !== existing.status) {
        history = appendHistory(history, {
          action: "status_changed",
          from: existing.status,
          to: next,
          byId: actor?.byId,
          byName: actor?.byName,
          summary: `Status ${existing.status} → ${next}`,
        });
        data = { ...data, status: next };
      }
    }
    if (
      data.assigneeName !== undefined ||
      data.assigneeId !== undefined ||
      data.assignedTo !== undefined
    ) {
      const nextName =
        data.assigneeName ||
        (Array.isArray(data.assignedTo) ? data.assignedTo[0] : undefined) ||
        "";
      const prevName = existing.assigneeName || existing.assignedTo?.[0] || "";
      if (String(nextName) !== String(prevName)) {
        history = appendHistory(history, {
          action: "assignee_changed",
          from: prevName || "Unassigned",
          to: nextName || "Unassigned",
          byId: actor?.byId,
          byName: actor?.byName,
          summary: `Assignee → ${nextName || "Unassigned"}`,
        });
      }
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      history = appendHistory(history, {
        action: "priority_changed",
        from: String(existing.priority),
        to: String(data.priority),
        byId: actor?.byId,
        byName: actor?.byName,
      });
    }
    if (data.issueType !== undefined) {
      const next = normalizeIssueType(data.issueType);
      if (next !== normalizeIssueType(existing.issueType)) {
        history = appendHistory(history, {
          action: "type_changed",
          from: existing.issueType,
          to: next,
          byId: actor?.byId,
          byName: actor?.byName,
        });
        data = { ...data, issueType: next };
      }
    }

    const forbidden = new Set([
      "id",
      "tenantId",
      "tenant_id",
      "issueId",
      "createdAt",
      "updatedAt",
      "history",
    ]);
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data || {})) {
      if (forbidden.has(key)) continue;
      if (value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") {
        cleaned[key] = null;
        continue;
      }
      cleaned[key] = value;
    }

    // Keep assignedTo in sync with assigneeName when provided
    if (cleaned.assigneeName && !cleaned.assignedTo) {
      cleaned.assignedTo = [String(cleaned.assigneeName)];
    }

    cleaned.history = history;

    const updatedAt = new Date().toISOString();
    const keys = Object.keys(cleaned);
    const setParts = keys.map((key) => `#${key} = :${key}`);
    setParts.push("#updatedAt = :updatedAt");

    const expressionNames: Record<string, string> = {
      "#updatedAt": "updatedAt",
    };
    const expressionValues: Record<string, unknown> = {
      ":updatedAt": updatedAt,
    };

    for (const key of keys) {
      expressionNames[`#${key}`] = key;
      expressionValues[`:${key}`] = cleaned[key];
    }

    await updateItem(
      tableNames.issues,
      { tenant_id: tenantId, id },
      `SET ${setParts.join(", ")}`,
      expressionValues,
      expressionNames
    );

    return this.getById(id, tenantId);
  },

  async updateStatus(
    id: string,
    status: IssueStatus | string,
    tenantId: string,
    actor?: HistoryActor
  ): Promise<Issue | null> {
    return this.update(
      id,
      { status: normalizeIssueStatus(status) },
      tenantId,
      actor
    );
  },

  async addComment(
    id: string,
    tenantId: string,
    comment: Omit<IssueComment, "id" | "createdAt"> & {
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
      authorName: comment.authorName || "User",
      authorEmail: comment.authorEmail,
      createdAt: comment.createdAt || new Date().toISOString(),
    };

    if (!entry.body) {
      throw new Error("Comment cannot be empty");
    }

    const comments = [...(existing.comments || []), entry];
    const history = appendHistory(existing.history, {
      action: "comment_added",
      byId: entry.authorId,
      byName: entry.authorName,
      summary: "Comment added",
    });

    return this.update(
      id,
      { comments, history } as Partial<CreateIssueInput>,
      tenantId
    );
  },

  async addAttachment(
    id: string,
    tenantId: string,
    attachment: IssueAttachment,
    actor?: HistoryActor
  ): Promise<Issue | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const attachments = [
      ...(existing.attachments || []),
      normalizeAttachment(attachment),
    ];
    const history = appendHistory(existing.history, {
      action: "attachment_added",
      byId: actor?.byId || attachment.uploadedBy,
      byName: actor?.byName,
      summary: `Attached ${attachment.name}`,
    });
    return this.update(
      id,
      { attachments, history } as Partial<CreateIssueInput>,
      tenantId
    );
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
    const history = appendHistory(existing.history, {
      action: "attachment_removed",
      summary: "Attachment removed",
    });
    return this.update(
      id,
      { attachments, history } as Partial<CreateIssueInput>,
      tenantId
    );
  },

  async delete(id: string, tenantId: string): Promise<void> {
    await deleteItem(tableNames.issues, { tenant_id: tenantId, id });
  },
};
