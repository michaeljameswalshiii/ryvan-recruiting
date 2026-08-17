"use server";

import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import {
  getSessionTenantId,
  getSession,
  getSessionUserId,
  getSessionUserEmail,
} from "../server-auth";
import { issueRepository } from "../db/repositories/issue-repository";
import {
  CreateIssueInput,
  IssueAttachment,
  IssueListFilters,
} from "../schemas/issue";
import {
  getIssueAttachmentUrl,
  storeIssueAttachment,
} from "../aws/issue-attachments";
import { isSiteAdmin } from "../roles";
import { PLATFORM_TENANT_ID, ensurePlatformTenant } from "../platform-tenant";

function revalidateIssue(id: string) {
  revalidatePath("/dashboard/issues");
  revalidatePath(`/dashboard/issues/${id}`);
}

async function actorFromSession() {
  const [userId, email] = await Promise.all([
    getSessionUserId(),
    getSessionUserEmail(),
  ]);
  const raw =
    email?.split("@")[0]?.replace(/[._]/g, " ") || userId || "User";
  const byName = raw
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { byId: userId || undefined, byName, email: email || undefined };
}

export async function createIssueAction(data: CreateIssueInput) {
  const session = await getSession();
  const allTenants =
    !!session &&
    isSiteAdmin(session.role) &&
    (!session.tenantScope || session.tenantScope === "all");
  const tenantId = allTenants ? PLATFORM_TENANT_ID : await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized — select a tenant first" };
  }

  try {
    if (allTenants) await ensurePlatformTenant();
    const actor = await actorFromSession();
    let keyPrefix = "ISS";
    try {
      if (allTenants) throw new Error("platform scope uses ISS");
      const { getTenantById } = await import(
        "@/lib/db/repositories/tenant-repository"
      );
      const { issueKeyPrefix } = await import("@/lib/schemas/issue");
      const tenant = await getTenantById(tenantId);
      keyPrefix = issueKeyPrefix(tenant?.subdomain || tenant?.name);
    } catch {
      /* keep ISS */
    }

    const issue = await issueRepository.create(
      {
        ...data,
        reportedBy: data.reportedBy || actor.byName,
        reporterName: data.reporterName || actor.byName,
        reporterId: data.reporterId || actor.byId,
      },
      tenantId,
      actor,
      { keyPrefix }
    );
    revalidatePath("/dashboard/issues");
    return { issue };
  } catch (error: any) {
    return { error: error?.message || "Failed to create issue" };
  }
}

export async function listIssuesAction(
  statusOrFilters?: string | IssueListFilters
) {
  const session = await getSession();
  if (!session) {
    return { issues: [] };
  }

  try {
    const filters: IssueListFilters =
      typeof statusOrFilters === "string"
        ? { status: statusOrFilters }
        : { ...(statusOrFilters || {}) };

    if (filters.mine) {
      const actor = await actorFromSession();
      filters.mineUserId = actor.byId;
      filters.mineEmail = actor.email;
      filters.mineName = actor.byName;
    }

    const allTenants =
      isSiteAdmin(session.role) &&
      (!session.tenantScope || session.tenantScope === "all");
    const tenantId = allTenants
      ? null
      : session.tenantScope || session.tenantId;
    const issues = tenantId
      ? await issueRepository.listByTenant(tenantId, filters)
      : allTenants
        ? await issueRepository.listAll(filters)
        : [];
    return { issues };
  } catch (error: any) {
    return { error: error?.message || "Failed to list issues" };
  }
}

export async function reorderIssuesAction(orderedIds: string[]) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return { error: "Unauthorized" };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: "orderedIds required" };
  }
  try {
    const issues = await issueRepository.reorder(tenantId, orderedIds);
    revalidatePath("/dashboard/issues");
    return { issues, success: true };
  } catch (error: any) {
    return { error: error?.message || "Failed to reorder" };
  }
}

export async function bulkUpdateIssueStatusAction(
  ids: string[],
  status: string
) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return { error: "Unauthorized" };
  if (!Array.isArray(ids) || !ids.length) {
    return { error: "Select at least one issue" };
  }
  try {
    const actor = await actorFromSession();
    const result = await issueRepository.bulkUpdateStatus(
      tenantId,
      ids,
      status,
      actor
    );
    revalidatePath("/dashboard/issues");
    return result;
  } catch (error: any) {
    return { error: error?.message || "Failed to bulk update" };
  }
}

export async function getIssueAction(id: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }

  try {
    const issue = await issueRepository.getById(id, tenantId);
    if (!issue) return { issue: null };

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
    return { error: error?.message || "Failed to get issue" };
  }
}

export async function updateIssueAction(
  id: string,
  data: Partial<CreateIssueInput>
) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }

  if (!id) {
    return { error: "Issue id is required" };
  }

  try {
    const actor = await actorFromSession();
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
      reporterId: data.reporterId,
      reporterName: data.reporterName,
      assignedTo: data.assignedTo,
      assigneeId: data.assigneeId,
      assigneeName: data.assigneeName,
      environment: data.environment,
      tags: data.tags,
      customerRequest: data.customerRequest,
      customerName: data.customerName,
      dueDate: data.dueDate,
      storyPoints: data.storyPoints,
      linkedEntity: data.linkedEntity,
      attachments: data.attachments,
      comments: data.comments,
    };

    const issue = await issueRepository.update(id, payload, tenantId, actor);
    if (!issue) {
      return { error: "Issue not found" };
    }
    revalidateIssue(id);
    return { issue };
  } catch (error: any) {
    console.error("[updateIssueAction]", id, error);
    return { error: error?.message || "Failed to update issue" };
  }
}

export async function updateIssueStatusAction(id: string, status: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }
  try {
    const actor = await actorFromSession();
    const issue = await issueRepository.updateStatus(
      id,
      status,
      tenantId,
      actor
    );
    if (!issue) return { error: "Issue not found" };
    revalidateIssue(id);
    return { issue };
  } catch (error: any) {
    return { error: error?.message || "Failed to update status" };
  }
}

export async function deleteIssueAction(id: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }

  try {
    await issueRepository.delete(id, tenantId);
    revalidatePath("/dashboard/issues");
    return { success: true };
  } catch (error: any) {
    return { error: error?.message || "Failed to delete issue" };
  }
}

export async function addIssueCommentAction(id: string, body: string) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }

  const text = (body || "").trim();
  if (!text) {
    return { error: "Comment cannot be empty" };
  }
  if (text.length > 5000) {
    return { error: "Comment is too long (max 5000 characters)" };
  }

  try {
    const actor = await actorFromSession();
    const issue = await issueRepository.addComment(id, tenantId, {
      body: text,
      authorId: actor.byId,
      authorName: actor.byName,
      authorEmail: actor.email,
    });

    if (!issue) return { error: "Issue not found" };
    revalidateIssue(id);
    return { issue };
  } catch (error: any) {
    console.error("[addIssueCommentAction]", id, error);
    return { error: error?.message || "Failed to add comment" };
  }
}

export async function addIssueAttachmentAction(id: string, formData: FormData) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }

  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { error: "No file provided" };
    }

    const actor = await actorFromSession();
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeIssueAttachment({
      buffer,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
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
      uploadedBy: actor.byId,
      uploadedByEmail: actor.email,
      uploadedAt: new Date().toISOString(),
    };

    const issue = await issueRepository.addAttachment(
      id,
      tenantId,
      attachment,
      actor
    );
    if (!issue) return { error: "Issue not found" };
    revalidateIssue(id);
    return { issue, attachment };
  } catch (error: any) {
    console.error("[addIssueAttachmentAction]", id, error);
    return { error: error?.message || "Failed to upload attachment" };
  }
}

export async function removeIssueAttachmentAction(
  id: string,
  attachmentId: string
) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return { error: "Unauthorized" };
  }

  try {
    const issue = await issueRepository.removeAttachment(
      id,
      tenantId,
      attachmentId
    );
    if (!issue) return { error: "Issue not found" };
    revalidateIssue(id);
    return { issue };
  } catch (error: any) {
    return { error: error?.message || "Failed to remove attachment" };
  }
}
