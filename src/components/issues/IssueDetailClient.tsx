'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Upload,
  FileText,
  Image as ImageIcon,
  Download,
  X,
  Send,
  Bug,
  Sparkles,
  Clock,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useIssue,
  useUpdateIssue,
  useDeleteIssue,
  useAddIssueComment,
  useAddIssueAttachment,
  useRemoveIssueAttachment,
} from '@/lib/hooks/query-issue';
import IssueDialog from './IssueDialog';
import type {
  CreateIssueInput,
  Issue,
  IssueAttachment,
  IssueComment,
} from '@/lib/schemas/issue';

const STATUSES = ['Open', 'In Progress', 'Blocked', 'Resolved', 'Closed'] as const;

function priorityBadge(priority: number) {
  if (priority === 1) return 'bg-red-500 text-white ring-red-200';
  if (priority === 2) return 'bg-orange-500 text-white ring-orange-200';
  if (priority === 3) return 'bg-amber-400 text-white ring-amber-200';
  return 'bg-emerald-500 text-white ring-emerald-200';
}

function priorityLabel(priority: number) {
  return (
    { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' }[priority] ||
    String(priority)
  );
}

function statusStyles(status: string) {
  const s = status?.toLowerCase() || '';
  if (s === 'open')
    return 'bg-sky-50 text-sky-800 border-sky-200 ring-sky-100';
  if (s.includes('progress'))
    return 'bg-amber-50 text-amber-900 border-amber-200 ring-amber-100';
  if (s === 'blocked')
    return 'bg-red-50 text-red-800 border-red-200 ring-red-100';
  if (s === 'resolved')
    return 'bg-emerald-50 text-emerald-800 border-emerald-200 ring-emerald-100';
  if (s === 'closed')
    return 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-100';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function displayType(type?: string) {
  if (type === 'Defect') return 'Bug';
  if (type === 'Enhancement') return 'Improvement';
  return type || 'Task';
}

function formatDate(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatRelative(value?: string) {
  if (!value) return '';
  try {
    const d = new Date(value).getTime();
    const diff = Date.now() - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 14) return `${days}d ago`;
    return formatDate(value);
  } catch {
    return formatDate(value);
  }
}

function formatFileSize(bytes?: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function isImageAttachment(a: IssueAttachment) {
  if (a.type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || '');
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-0.5 shrink-0">
        {label}
      </div>
      <div className="text-sm text-gray-900 text-right min-w-0">{children}</div>
    </div>
  );
}

export default function IssueDetailClient({ issueId }: { issueId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: issue, isLoading, error, refetch } = useIssue(issueId);
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const addComment = useAddIssueComment(issueId);
  const addAttachment = useAddIssueAttachment(issueId);
  const removeAttachment = useRemoveIssueAttachment(issueId);

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleUpdate = async (data: CreateIssueInput) => {
    await updateIssue.mutateAsync({ id: issueId, data });
    await refetch();
  };

  const handleDelete = async () => {
    try {
      await deleteIssue.mutateAsync(issueId);
      router.push('/dashboard/issues');
    } catch {
      /* toast from hook */
    }
  };

  const handlePostComment = async () => {
    const text = commentDraft.trim();
    if (!text) return;
    try {
      await addComment.mutateAsync(text);
      setCommentDraft('');
      await refetch();
    } catch {
      /* toast */
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      try {
        await addAttachment.mutateAsync(file);
      } catch {
        /* toast per file */
      }
    }
    await refetch();
  };

  const comments = useMemo(() => {
    const list = [...((issue as Issue)?.comments || [])] as IssueComment[];
    return list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [issue]);

  const attachments = useMemo(
    () => ((issue as Issue)?.attachments || []) as IssueAttachment[],
    [issue]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        Loading issue...
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-8 px-4">
        <Link
          href="/dashboard/issues"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Issues
        </Link>
        <div className="bg-white border border-red-100 rounded-2xl p-10 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Issue not found</h2>
          <p className="text-sm text-gray-500 mt-1">
            {(error as Error)?.message ||
              'This issue may have been deleted or the link is invalid.'}
          </p>
          <Button className="mt-4" onClick={() => router.push('/dashboard/issues')}>
            Return to list
          </Button>
        </div>
      </div>
    );
  }

  const i = issue as Issue;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-16">
        <Link
          href="/dashboard/issues"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to work items
        </Link>

        {/* Hero header */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div
            className={`absolute inset-x-0 top-0 h-1.5 ${
              displayType(i.issueType) === 'Bug'
                ? 'bg-gradient-to-r from-red-500 via-rose-500 to-orange-400'
                : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-400'
            }`}
          />
          <div className="p-6 sm:p-7">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {i.issueId}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      displayType(i.issueType) === 'Bug'
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                        : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                    }`}
                  >
                    {displayType(i.issueType) === 'Bug' ? (
                      <Bug className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {displayType(i.issueType)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(i.status)}`}
                  >
                    {i.status}
                  </span>
                  {i.mvp && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-800 ring-1 ring-violet-100">
                      MVP
                    </span>
                  )}
                  {i.customerRequest && (
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                      title="Customer-specific request"
                    >
                      Customer
                      {i.customerName ? ` · ${i.customerName}` : ""}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold text-white px-2 py-1 rounded-full ring-2 ${priorityBadge(i.priority)}`}
                    title={`Priority ${i.priority}`}
                  >
                    P{i.priority} · {priorityLabel(i.priority)}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 leading-snug">
                  {i.title}
                </h1>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Created {formatDate(i.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Updated {formatRelative(i.updatedAt)}
                  </span>
                  {i.reportedBy && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {i.reportedBy}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {comments.length} comment{comments.length === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" />
                    {attachments.length} file{attachments.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
                {confirmDelete ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-xl"
                      onClick={handleDelete}
                      disabled={deleteIssue.isPending}
                    >
                      {deleteIssue.isPending ? 'Deleting…' : 'Confirm delete'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Status stepper */}
            <div className="mt-6 flex flex-wrap gap-2">
              {STATUSES.map((status) => {
                const active = i.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={updateIssue.isPending || active}
                    onClick={async () => {
                      try {
                        await updateIssue.mutateAsync({
                          id: issueId,
                          data: { status },
                        });
                        await refetch();
                      } catch {
                        /* toast */
                      }
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    } disabled:opacity-60`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Description */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                Description
              </h2>
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                {i.description?.trim() ? (
                  i.description
                ) : (
                  <span className="text-slate-400 italic">
                    No description provided. Use Edit to add details.
                  </span>
                )}
              </div>
            </section>

            {/* Comments */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  Comments
                  <span className="text-xs font-medium text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                    {comments.length}
                  </span>
                </h2>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {/* Composer */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-shadow">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handlePostComment();
                      }
                    }}
                    rows={3}
                    placeholder="Add a comment for the team… (Ctrl/⌘ + Enter to post)"
                    className="w-full resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none min-h-[72px]"
                  />
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-slate-400">
                      Visible to everyone on this tenant
                    </p>
                    <Button
                      size="sm"
                      className="rounded-xl bg-blue-600 hover:bg-blue-700"
                      disabled={!commentDraft.trim() || addComment.isPending}
                      onClick={handlePostComment}
                    >
                      {addComment.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Post comment
                    </Button>
                  </div>
                </div>

                {/* Thread */}
                {comments.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No comments yet. Start the discussion.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {comments.map((c) => (
                      <li
                        key={c.id}
                        className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 hover:border-slate-200 transition-colors"
                      >
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-sm">
                          {initials(c.authorName || c.authorEmail)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-slate-900">
                              {c.authorName || c.authorEmail || 'User'}
                            </span>
                            <span
                              className="text-[11px] text-slate-400"
                              title={formatDate(c.createdAt)}
                            >
                              {formatRelative(c.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {c.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Attachments */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-blue-600" />
                  Attachments
                  <span className="text-xs font-medium text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                    {attachments.length}
                  </span>
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={addAttachment.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {addAttachment.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.txt,.doc,.docx,.csv,.xlsx,.xls,.zip"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void uploadFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files?.length) {
                      void uploadFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    dragOver
                      ? 'border-blue-400 bg-blue-50/60'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <Upload className="h-7 w-7 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700">
                    Drop files here or click to upload
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Images, PDF, Office docs, text, CSV, ZIP · max 8MB
                  </p>
                </div>

                {attachments.length > 0 && (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {attachments.map((a) => (
                      <li
                        key={a.id}
                        className="group relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/40 hover:bg-white hover:shadow-sm transition-all"
                      >
                        {isImageAttachment(a) && a.url ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block aspect-[16/10] bg-slate-100 overflow-hidden"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={a.url}
                              alt={a.name}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="aspect-[16/10] flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50">
                            <FileText className="h-10 w-10 text-slate-300" />
                          </div>
                        )}
                        <div className="p-3 flex items-start gap-2">
                          <div className="mt-0.5 text-slate-400">
                            {isImageAttachment(a) ? (
                              <ImageIcon className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {a.name}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {[
                                formatFileSize(a.size),
                                a.uploadedByEmail?.split('@')[0] || a.uploadedBy,
                                a.uploadedAt
                                  ? formatRelative(a.uploadedAt)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {a.url && (
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                download={a.name}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                title="Open / download"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                              title="Remove"
                              disabled={removeAttachment.isPending}
                              onClick={async () => {
                                try {
                                  await removeAttachment.mutateAsync(a.id);
                                  await refetch();
                                } catch {
                                  /* toast */
                                }
                              }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Details</h2>
              <p className="text-xs text-slate-400 mb-3">Metadata for this issue</p>
              <div>
                <Field label="Priority">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ring-2 ${priorityBadge(i.priority)}`}
                    >
                      {i.priority}
                    </span>
                    <span className="text-slate-600">{priorityLabel(i.priority)}</span>
                  </span>
                </Field>
                <Field label="Status">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles(i.status)}`}
                  >
                    {i.status}
                  </span>
                </Field>
                <Field label="Environment">
                  <span className="font-medium">{i.environment || '—'}</span>
                </Field>
                <Field label="Feature area">
                  <span>{i.featureArea || '—'}</span>
                </Field>
                <Field label="Severity">
                  <span>{i.severity || '—'}</span>
                </Field>
                <Field label="Reported by">
                  <span>{i.reportedBy || '—'}</span>
                </Field>
                <Field label="Assigned to">
                  {i.assigneeName ||
                  (Array.isArray(i.assignedTo) && i.assignedTo.length > 0)
                    ? i.assigneeName || i.assignedTo!.join(', ')
                    : '—'}
                </Field>
                <Field label="CRM link">
                  {i.linkedEntity?.id ? (
                    <Link
                      href={
                        i.linkedEntity.type === 'candidate'
                          ? `/dashboard/candidates/${i.linkedEntity.id}`
                          : i.linkedEntity.type === 'job'
                            ? `/dashboard/jobs/${i.linkedEntity.id}`
                            : i.linkedEntity.type === 'company'
                              ? `/dashboard/companies/${i.linkedEntity.id}`
                              : `/dashboard/contact-info/${i.linkedEntity.id}`
                      }
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {i.linkedEntity.label ||
                        `${i.linkedEntity.type} · ${i.linkedEntity.id.slice(0, 8)}…`}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Field>
                <Field label="Tags">
                  {Array.isArray(i.tags) && i.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 justify-end">
                      {i.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </Field>
                <Field label="Internal ID">
                  <span className="font-mono text-[10px] text-slate-400 break-all">
                    {i.id}
                  </span>
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                History
              </h2>
              {Array.isArray(i.history) && i.history.length > 0 ? (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {[...i.history]
                    .reverse()
                    .slice(0, 30)
                    .map((h) => (
                      <li
                        key={h.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"
                      >
                        <div className="font-semibold text-slate-900">
                          {h.summary || h.action.replace(/_/g, ' ')}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {h.byName || 'System'} · {formatRelative(h.at)}
                          {h.from && h.to ? (
                            <span className="text-slate-400">
                              {' '}
                              ({h.from} → {h.to})
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  Status and assignment changes will appear here.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm p-5">
              <h2 className="text-sm font-semibold mb-2">Activity summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-300">Comments</dt>
                  <dd className="font-semibold">{comments.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-300">Attachments</dt>
                  <dd className="font-semibold">{attachments.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-300">Last update</dt>
                  <dd className="font-medium text-right text-slate-100 text-xs">
                    {formatRelative(i.updatedAt)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </div>

      <IssueDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialData={{
          title: i.title,
          description: i.description,
          issueType: i.issueType,
          priority: i.priority,
          severity: i.severity,
          mvp: i.mvp,
          featureArea: i.featureArea,
          status: i.status,
          reportedBy: i.reportedBy,
          assignedTo: i.assignedTo,
          assigneeName: i.assigneeName || i.assignedTo?.[0],
          environment: i.environment,
          tags: i.tags,
          customerRequest: i.customerRequest,
          customerName: i.customerName,
          linkedEntity: i.linkedEntity,
          attachments: i.attachments,
        }}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
