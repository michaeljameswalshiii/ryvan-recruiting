"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  Bug,
  BookOpen,
  CheckSquare,
  Sparkles,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIssues, useCreateIssue, useUpdateIssueStatus } from "@/lib/hooks/query-issue";
import IssueDialog from "./IssueDialog";
import {
  BOARD_COLUMNS,
  assigneeLabel,
  displayIssueType,
  formatIssueDate,
  groupByStatus,
  priorityDot,
  priorityLabel,
  statusStyles,
  typeBadgeClass,
  type Issue,
} from "./issue-ui";
import type { CreateIssueInput, IssueListFilters } from "@/lib/schemas/issue";

type ViewMode = "board" | "backlog";

export default function IssuesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") === "backlog" ? "backlog" : "board") as ViewMode;

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const filters: IssueListFilters = useMemo(() => {
    const f: IssueListFilters = {};
    if (q.trim()) f.q = q.trim();
    if (typeFilter) f.type = typeFilter;
    if (statusFilter) f.status = statusFilter;
    if (priorityFilter) f.priority = Number(priorityFilter);
    return f;
  }, [q, typeFilter, statusFilter, priorityFilter]);

  const { data: issues = [], isLoading } = useIssues(filters);
  const createIssue = useCreateIssue();
  const updateStatus = useUpdateIssueStatus();

  const setView = (v: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "board") params.delete("view");
    else params.set("view", v);
    router.replace(`/dashboard/issues?${params.toString()}`, { scroll: false });
  };

  const byStatus = useMemo(() => groupByStatus(issues), [issues]);

  const handleCreate = async (data: CreateIssueInput) => {
    await createIssue.mutateAsync(data);
    setDialogOpen(false);
  };

  const onDropStatus = useCallback(
    async (status: string) => {
      if (!dragId) return;
      const issue = issues.find((i) => i.id === dragId);
      setDragId(null);
      if (!issue || issue.status === status) return;
      await updateStatus.mutateAsync({ id: dragId, status });
    },
    [dragId, issues, updateStatus]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        Loading work items…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-5 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Work items
            </h1>
            <p className="mt-1 text-slate-500">
              Board and backlog for bugs, stories, and tasks — ADO / Jira–style
              tracking inside Trio
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setView("board")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  view === "board"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                Board
              </button>
              <button
                type="button"
                onClick={() => setView("backlog")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  view === "backlog"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <List className="h-4 w-4" />
                Backlog
              </button>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              New work item
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div
          data-ink-on-light
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search key, title, tags…"
              className="border-slate-200 bg-white pl-9 text-slate-900"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">All types</option>
            <option value="Bug">Bug</option>
            <option value="Story">Story</option>
            <option value="Task">Task</option>
            <option value="Improvement">Improvement</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">All statuses</option>
            {BOARD_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="">All priorities</option>
            <option value="1">Critical</option>
            <option value="2">High</option>
            <option value="3">Medium</option>
            <option value="4">Low</option>
          </select>
          <span className="text-xs font-medium text-slate-500">
            {issues.length} item{issues.length === 1 ? "" : "s"}
          </span>
        </div>

        {view === "board" ? (
          <BoardView
            byStatus={byStatus}
            dragId={dragId}
            setDragId={setDragId}
            onDropStatus={onDropStatus}
          />
        ) : (
          <BacklogView issues={issues} onCreate={() => setDialogOpen(true)} />
        )}
      </div>

      <IssueDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
        mode="create"
      />
    </div>
  );
}

function BoardView({
  byStatus,
  dragId,
  setDragId,
  onDropStatus,
}: {
  byStatus: Record<string, Issue[]>;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDropStatus: (status: string) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {BOARD_COLUMNS.map((col) => {
        const cards = byStatus[col] || [];
        return (
          <div
            key={col}
            className="flex w-72 shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/80"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropStatus(col)}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                {col}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                {cards.length}
              </span>
            </div>
            <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-2 overflow-y-auto p-2">
              {cards.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-slate-400">
                  Drop items here
                </p>
              ) : (
                cards.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    dragging={dragId === issue.id}
                    onDragStart={() => setDragId(issue.id)}
                    onDragEnd={() => setDragId(null)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IssueCard({
  issue,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  issue: Issue;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const type = displayIssueType(issue.issueType);
  const TypeIcon =
    type === "Bug" ? Bug : type === "Story" ? BookOpen : type === "Task" ? CheckSquare : Sparkles;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow ${
        dragging ? "opacity-50 ring-2 ring-blue-400" : ""
      }`}
    >
      <div className="mb-2 flex items-start gap-1">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" />
        <Link
          href={`/dashboard/issues/${issue.id}`}
          className="min-w-0 flex-1 text-sm font-semibold text-slate-900 hover:text-blue-700"
        >
          {issue.title}
        </Link>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {issue.issueId}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeBadgeClass(issue.issueType)}`}
        >
          <TypeIcon className="h-3 w-3" />
          {type}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600">
          <span className={`h-1.5 w-1.5 rounded-full ${priorityDot(issue.priority)}`} />
          {priorityLabel(issue.priority)}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span className="truncate">{assigneeLabel(issue)}</span>
        <span>{formatIssueDate(issue.updatedAt).split(",")[0]}</span>
      </div>
    </div>
  );
}

function BacklogView({
  issues,
  onCreate,
}: {
  issues: Issue[];
  onCreate: () => void;
}) {
  if (issues.length === 0) {
    return (
      <div
        data-ink-on-light
        className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm"
      >
        <Bug className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-900">No work items</h3>
        <p className="mt-1 text-sm text-slate-500">
          Create a bug, story, or task to start the board.
        </p>
        <Button className="mt-4 rounded-xl" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New work item
        </Button>
      </div>
    );
  }

  return (
    <div
      data-ink-on-light
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 w-24">Key</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3 w-28">Type</th>
            <th className="px-4 py-3 w-24">Priority</th>
            <th className="px-4 py-3 w-28">Status</th>
            <th className="px-4 py-3 w-32">Assignee</th>
            <th className="px-4 py-3 w-36">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((issue) => (
            <tr key={issue.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600">
                {issue.issueId}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/issues/${issue.id}`}
                  className="font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                >
                  {issue.title}
                </Link>
                {issue.tags && issue.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {issue.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${typeBadgeClass(issue.issueType)}`}
                >
                  {displayIssueType(issue.issueType)}
                </span>
              </td>
              <td className="px-4 py-3 text-xs font-medium text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${priorityDot(issue.priority)}`}
                  />
                  {priorityLabel(issue.priority)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusStyles(issue.status)}`}
                >
                  {issue.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">
                {assigneeLabel(issue)}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {formatIssueDate(issue.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
