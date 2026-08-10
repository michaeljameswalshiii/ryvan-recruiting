import type { Issue, IssuePriority, IssueStatus } from "@/lib/schemas/issue";
import {
  BOARD_COLUMNS,
  displayIssueType,
  priorityLabel,
} from "@/lib/schemas/issue";

export { BOARD_COLUMNS, displayIssueType, priorityLabel };

export function statusStyles(status: string) {
  const s = status?.toLowerCase() || "";
  if (s === "open") return "bg-sky-50 text-sky-800 border-sky-200";
  if (s.includes("progress")) return "bg-amber-50 text-amber-900 border-amber-200";
  if (s === "blocked") return "bg-red-50 text-red-800 border-red-200";
  if (s === "resolved") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (s === "closed") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export function priorityDot(priority: number) {
  if (priority === 1) return "bg-red-500";
  if (priority === 2) return "bg-orange-500";
  if (priority === 3) return "bg-amber-400";
  return "bg-emerald-500";
}

export function priorityBadgeClass(priority: number) {
  if (priority === 1) return "bg-red-500 text-white";
  if (priority === 2) return "bg-orange-500 text-white";
  if (priority === 3) return "bg-amber-400 text-slate-900";
  return "bg-emerald-500 text-white";
}

export function typeBadgeClass(type?: string) {
  const t = displayIssueType(type);
  if (t === "Bug") return "bg-rose-50 text-rose-800 border-rose-200";
  if (t === "Story") return "bg-violet-50 text-violet-800 border-violet-200";
  if (t === "Task") return "bg-blue-50 text-blue-800 border-blue-200";
  return "bg-teal-50 text-teal-800 border-teal-200";
}

export function formatIssueDate(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function groupByStatus(issues: Issue[]): Record<IssueStatus, Issue[]> {
  const map = Object.fromEntries(
    BOARD_COLUMNS.map((c) => [c, [] as Issue[]])
  ) as Record<IssueStatus, Issue[]>;
  for (const issue of issues) {
    const st = (issue.status || "Open") as IssueStatus;
    if (map[st]) map[st].push(issue);
    else map.Open.push(issue);
  }
  return map;
}

export function assigneeLabel(issue: Issue): string {
  return (
    issue.assigneeName ||
    (issue.assignedTo && issue.assignedTo[0]) ||
    "Unassigned"
  );
}

export type { Issue, IssuePriority, IssueStatus };
