'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Plus,
  ArrowRight,
  Bug,
  Sparkles,
  MessageSquare,
  Paperclip,
} from 'lucide-react';
import { useIssues, useCreateIssue } from '@/lib/hooks/query-issue';
import IssueDialog from './IssueDialog';

function statusStyles(status: string) {
  const s = status?.toLowerCase() || '';
  if (s === 'open') return 'bg-sky-50 text-sky-800 border-sky-200';
  if (s.includes('progress')) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (s === 'resolved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (s === 'closed') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function priorityDot(priority: number) {
  if (priority === 1) return 'bg-red-500';
  if (priority === 2) return 'bg-orange-500';
  if (priority === 3) return 'bg-amber-400';
  return 'bg-emerald-500';
}

export default function IssuesClient() {
  const { data: issues = [], isLoading } = useIssues();
  const createIssue = useCreateIssue();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreate = async (data: any) => {
    await createIssue.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-slate-500 flex items-center gap-2">
        <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        Loading issues...
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Issues
            </h1>
            <p className="text-slate-500 mt-1">
              Track defects, enhancements, comments, and attachments
            </p>
          </div>
          <Button
            onClick={() => setIsDialogOpen(true)}
            size="lg"
            className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-sm"
          >
            <Plus className="mr-2 h-5 w-5" /> New Issue
          </Button>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500 w-28">
                  ID
                </th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Title
                </th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500 w-20">
                  Priority
                </th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Env
                </th>
                <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-slate-500 w-24">
                  Activity
                </th>
                <th className="text-left p-4 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-16 text-center">
                    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Bug className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="font-medium text-lg text-slate-900">
                      No issues yet
                    </h3>
                    <p className="text-slate-500 mt-1">
                      Create your first defect or enhancement
                    </p>
                    <Button
                      className="mt-4 rounded-xl"
                      onClick={() => setIsDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" /> New Issue
                    </Button>
                  </td>
                </tr>
              ) : (
                issues.map((issue: any) => {
                  const commentCount = Array.isArray(issue.comments)
                    ? issue.comments.length
                    : 0;
                  const fileCount = Array.isArray(issue.attachments)
                    ? issue.attachments.length
                    : 0;
                  return (
                    <tr
                      key={issue.id}
                      className="hover:bg-slate-50/80 cursor-pointer group transition-colors"
                      onClick={() => {
                        if (issue.id) {
                          window.location.href = `/dashboard/issues/${issue.id}`;
                        }
                      }}
                    >
                      <td className="p-4 font-mono text-sm text-slate-600">
                        <Link
                          href={`/dashboard/issues/${issue.id}`}
                          className="text-blue-600 hover:underline font-semibold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {issue.issueId || issue.id}
                        </Link>
                      </td>
                      <td className="p-4 font-medium text-slate-900">
                        <Link
                          href={`/dashboard/issues/${issue.id}`}
                          className="hover:text-blue-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {issue.title}
                        </Link>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            issue.issueType === 'Defect'
                              ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                              : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                          }`}
                        >
                          {issue.issueType === 'Defect' ? (
                            <Bug className="h-3 w-3" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {issue.issueType}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${priorityDot(issue.priority)}`}
                          />
                          P{issue.priority}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex capitalize px-2.5 py-1 text-xs font-medium rounded-full border ${statusStyles(issue.status)}`}
                        >
                          {issue.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {issue.environment || '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1" title="Comments">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {commentCount}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Attachments">
                            <Paperclip className="h-3.5 w-3.5" />
                            {fileCount}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Link
                          href={`/dashboard/issues/${issue.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex p-1.5 rounded-lg text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50"
                          aria-label={`Open ${issue.issueId}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <IssueDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSubmit={handleCreate}
        />
      </div>
    </div>
  );
}
