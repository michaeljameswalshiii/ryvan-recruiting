/**
 * Work-item / issue model — ADO/Jira-inspired, multi-tenant.
 * Backward compatible with legacy Defect/Enhancement + Open statuses.
 */

export const ISSUE_TYPES = [
  "Bug",
  "Story",
  "Task",
  "Improvement",
  // Legacy aliases still accepted on write/read
  "Defect",
  "Enhancement",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_STATUSES = [
  "Open",
  "In Progress",
  "Blocked",
  "Resolved",
  "Closed",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = [1, 2, 3, 4] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
};

export const BOARD_COLUMNS: IssueStatus[] = [
  "Open",
  "In Progress",
  "Blocked",
  "Resolved",
  "Closed",
];

export interface IssueAttachment {
  id: string;
  url: string;
  s3Key?: string;
  name: string;
  type?: string;
  size?: number;
  uploadedBy?: string;
  uploadedByEmail?: string;
  uploadedAt?: string;
}

export interface IssueComment {
  id: string;
  body: string;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  createdAt: string;
}

export type IssueHistoryAction =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "priority_changed"
  | "type_changed"
  | "updated"
  | "comment_added"
  | "attachment_added"
  | "attachment_removed";

export interface IssueHistoryEvent {
  id: string;
  action: IssueHistoryAction;
  at: string;
  byId?: string;
  byName?: string;
  from?: string;
  to?: string;
  summary?: string;
}

export interface IssueLinkedEntity {
  type: "candidate" | "job" | "company" | "contact";
  id: string;
  label?: string;
}

export interface Issue {
  id: string;
  tenantId: string;
  /** Human key e.g. ISS-001 */
  issueId: string;
  title: string;
  description?: string;
  issueType: IssueType;
  priority: IssuePriority;
  severity?: string;
  mvp?: boolean;
  featureArea?: string;
  status: IssueStatus;
  reportedBy?: string;
  reporterId?: string;
  reporterName?: string;
  /** Legacy multi-assignee; prefer assigneeId */
  assignedTo?: string[];
  assigneeId?: string;
  assigneeName?: string;
  environment?: "Dev" | "QA" | "Prod";
  tags?: string[];
  /**
   * True when this work item is a customer-specific request
   * (vs internal product / platform work).
   */
  customerRequest?: boolean;
  /** Customer / account name when customerRequest is true */
  customerName?: string;
  dueDate?: string;
  storyPoints?: number;
  linkedEntity?: IssueLinkedEntity;
  attachments?: IssueAttachment[];
  comments?: IssueComment[];
  history?: IssueHistoryEvent[];
  /** Lexicographic backlog rank */
  rank?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateIssueInput = Omit<
  Issue,
  "id" | "tenantId" | "createdAt" | "updatedAt" | "issueId" | "history"
> & {
  issueId?: string;
  history?: IssueHistoryEvent[];
};

export type UpdateIssueInput = Partial<CreateIssueInput> & { id: string };

export interface IssueListFilters {
  status?: string;
  type?: string;
  priority?: number;
  assignee?: string;
  q?: string;
  /** my = assigned to current user */
  mine?: boolean;
  /** Only customer-request work items */
  customerRequest?: boolean;
  /** Set by server when mine=true */
  mineUserId?: string;
  mineEmail?: string;
  mineName?: string;
}

/** Build display key prefix from tenant subdomain (e.g. ryvan → RYVAN) */
export function issueKeyPrefix(subdomainOrName?: string | null): string {
  const raw = String(subdomainOrName || "ISS")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  return raw || "ISS";
}

/** Normalize legacy type labels to modern ones for display */
export function displayIssueType(type?: string): string {
  const t = String(type || "Task");
  if (t === "Defect") return "Bug";
  if (t === "Enhancement") return "Improvement";
  return t;
}

export function normalizeIssueStatus(raw?: string): IssueStatus {
  const s = String(raw || "Open").trim();
  if (s === "In Progress" || s.toLowerCase().includes("progress"))
    return "In Progress";
  if (s === "Blocked" || s.toLowerCase() === "blocked") return "Blocked";
  if (s === "Resolved" || s.toLowerCase() === "resolved") return "Resolved";
  if (s === "Closed" || s.toLowerCase() === "closed") return "Closed";
  if (s === "New" || s.toLowerCase() === "new") return "Open";
  if (s === "Active" || s.toLowerCase() === "active") return "In Progress";
  return "Open";
}

export function normalizeIssueType(raw?: string): IssueType {
  const t = String(raw || "Task").trim();
  if (t === "Defect" || t === "Bug") return "Bug";
  if (t === "Enhancement" || t === "Improvement") return "Improvement";
  if (t === "Story" || t === "Feature") return "Story";
  if (t === "Task") return "Task";
  return "Task";
}

export function priorityLabel(p?: number): string {
  if (p === 1 || p === 2 || p === 3 || p === 4) return PRIORITY_LABELS[p];
  return "Medium";
}
