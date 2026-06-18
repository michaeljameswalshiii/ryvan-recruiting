'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import { useIssues, useCreateIssue } from '@/lib/hooks/query-issue';
import IssueDialog from './IssueDialog';
import Link from 'next/link';

export default function IssuesClient() {
  const { data: issues = [], isLoading } = useIssues();
  const createIssue = useCreateIssue();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreate = async (data: any) => {
    await createIssue.mutateAsync(data);
  };

  if (isLoading) {
    return <div className="p-6">Loading issues...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Issues</h1>
          <p className="text-gray-500 mt-1">Track defects, enhancements, and improvements</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} size="lg">
          <Plus className="mr-2 h-5 w-5" /> New Issue
        </Button>
      </div>

      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-4 font-medium w-28">ID</th>
              <th className="text-left p-4 font-medium">Title</th>
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium w-20">Priority</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-left p-4 font-medium">Environment</th>
              <th className="text-left p-4 font-medium w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {issues.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-16 text-center">
                  <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    ⚠️
                  </div>
                  <h3 className="font-medium text-lg">No issues yet</h3>
                  <p className="text-gray-500 mt-1">Create your first defect or enhancement</p>
                </td>
              </tr>
            ) : (
              issues.map((issue: any) => (
                <tr 
                  key={issue.id} 
                  className="hover:bg-gray-50 cursor-pointer group"
                  onClick={() => window.location.href = `/dashboard/issues/${issue.id}`}
                >
                  <td className="p-4 font-mono text-sm text-gray-600">{issue.issueId}</td>
                  <td className="p-4 font-medium">{issue.title}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      issue.issueType === 'Defect' 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {issue.issueType}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      issue.priority === 1 ? 'bg-red-500 text-white' :
                      issue.priority === 2 ? 'bg-orange-500 text-white' :
                      issue.priority === 3 ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'
                    }`}>
                      {issue.priority}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="capitalize px-3 py-1 text-sm rounded-full bg-gray-100">
                      {issue.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{issue.environment}</td>
                  <td className="p-4">
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                  </td>
                </tr>
              ))
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
  );
}
