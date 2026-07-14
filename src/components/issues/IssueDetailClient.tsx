'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useIssue, useUpdateIssue, useDeleteIssue } from '@/lib/hooks/query-issue';
import IssueDialog from './IssueDialog';
import type { CreateIssueInput, Issue } from '@/lib/schemas/issue';

function priorityBadge(priority: number) {
  if (priority === 1) return 'bg-red-500 text-white';
  if (priority === 2) return 'bg-orange-500 text-white';
  if (priority === 3) return 'bg-yellow-500 text-white';
  return 'bg-green-500 text-white';
}

function priorityLabel(priority: number) {
  return (
    { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' }[priority] ||
    String(priority)
  );
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() || '';
  if (s === 'open') return 'bg-sky-50 text-sky-800 border-sky-200';
  if (s.includes('progress')) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (s === 'resolved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (s === 'closed') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  );
}

export default function IssueDetailClient({ issueId }: { issueId: string }) {
  const router = useRouter();
  const { data: issue, isLoading, error, refetch } = useIssue(issueId);
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading issue...
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-8">
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
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      <Link
        href="/dashboard/issues"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Issues
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-gray-500">{i.issueId}</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  i.issueType === 'Defect'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {i.issueType}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(i.status)}`}
              >
                {i.status}
              </span>
              {i.mvp && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800">
                  MVP
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {i.title}
            </h1>
            <p className="text-xs text-gray-400">
              Created {formatDate(i.createdAt)} · Updated {formatDate(i.updatedAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteIssue.isPending}
                >
                  {deleteIssue.isPending ? 'Deleting…' : 'Confirm delete'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Description
            </h2>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {i.description?.trim() || (
                <span className="text-gray-400 italic">No description provided.</span>
              )}
            </p>
          </section>

          {Array.isArray(i.attachments) && i.attachments.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Attachments
              </h2>
              <ul className="space-y-2">
                {i.attachments.map((a, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{a.name}</span>
                    {a.url && !a.url.startsWith('blob:') ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline text-xs shrink-0 ml-2"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Local only</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Sidebar meta */}
        <div className="space-y-5">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Details
            </h2>
            <Field label="Priority">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${priorityBadge(i.priority)}`}
              >
                {i.priority}
              </span>
              <span className="ml-2 text-gray-600">{priorityLabel(i.priority)}</span>
            </Field>
            <Field label="Status">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(i.status)}`}
              >
                {i.status}
              </span>
            </Field>
            <Field label="Environment">{i.environment || '—'}</Field>
            <Field label="Feature area">{i.featureArea || '—'}</Field>
            <Field label="Severity">{i.severity || '—'}</Field>
            <Field label="Reported by">{i.reportedBy || '—'}</Field>
            <Field label="Assigned to">
              {Array.isArray(i.assignedTo) && i.assignedTo.length > 0
                ? i.assignedTo.join(', ')
                : '—'}
            </Field>
            <Field label="Tags">
              {Array.isArray(i.tags) && i.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {i.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
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
              <span className="font-mono text-xs text-gray-500 break-all">{i.id}</span>
            </Field>
          </section>

          {/* Quick status actions */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Quick status
            </h2>
            <div className="flex flex-wrap gap-2">
              {(['Open', 'In Progress', 'Resolved', 'Closed'] as const).map(
                (status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={i.status === status ? 'default' : 'outline'}
                    className={
                      i.status === status ? 'bg-blue-600 hover:bg-blue-700' : ''
                    }
                    disabled={updateIssue.isPending || i.status === status}
                    onClick={async () => {
                      try {
                        await updateIssue.mutateAsync({
                          id: issueId,
                          data: { status },
                        });
                        await refetch();
                      } catch {
                        /* toast in hook */
                      }
                    }}
                  >
                    {status}
                  </Button>
                )
              )}
            </div>
          </section>
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
          environment: i.environment,
          tags: i.tags,
          attachments: i.attachments,
        }}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
