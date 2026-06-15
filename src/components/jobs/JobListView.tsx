'use client';

import Link from 'next/link';
import { IdBadge } from '@/components/ui/id-badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useDeleteJob } from '@/lib/hooks/query-job';

interface Job {
  id: string;
  title: string;
  employmentType?: string;
  companyId?: string;
  companyName?: string;
  status: "Open" | "On Hold" | "Closed";
  candidates?: any[];
  createdAt?: string;
}

interface JobListViewProps {
  jobs: Job[];
}

export function JobListView({ jobs }: JobListViewProps) {
  const deleteJob = useDeleteJob();

  const handleDelete = (jobId: string, jobTitle: string) => {
    if (!confirm(`Delete job "${jobTitle}"? This cannot be undone.`)) return;
    deleteJob.mutate(jobId);
  };

  if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
        No jobs found. Click "Add Job" to create one.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
<tr className="border-b border-border">
            <th className="text-left p-4">Job Title</th>
            <th className="text-left p-4">Company</th>
            <th className="text-left p-4">Type</th>
            <th className="text-left p-4">Candidates</th>
            <th className="text-left p-4">Date Added</th>
            <th className="text-left p-4">Status</th>
            <th className="text-left p-4">ID</th>
            <th className="text-left p-4 w-20">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-border hover:bg-muted/50">
<td className="p-4 font-medium">
                <Link href={`/dashboard/jobs/${job.id}`} className="hover:underline text-blue-500">
                  {job.title}
                </Link>
              </td>
<td className="p-4">
                {job.companyId ? (
                  <Link 
                    href={`/dashboard/companies/${job.companyId}`}
                    className="hover:underline hover:text-blue-600 font-medium transition-colors"
                  >
                    {job.companyName || 'Unknown Company'}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    {job.companyName || '—'}
                  </span>
                )}
              </td>
              <td className="p-4">
                <span className="bg-green-500/10 text-green-500 px-2 py-1 rounded">
                  {job.employmentType || 'Full-time'}
                </span>
              </td>
              <td className="p-4">{job.candidates?.length || 0} candidates</td>
              <td className="p-4 text-muted-foreground">
                {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}
              </td>
              <td className="p-4">
                <span className={`px-3 py-1 rounded-full text-xs ${
                  job.status === 'Open' ? 'bg-green-500 text-white' :
                  job.status === 'On Hold' ? 'bg-yellow-500 text-white' :
                  'bg-gray-500 text-white'
                }`}>
                  {job.status}
                </span>
              </td>
<td className="p-4">
                <IdBadge id={job.id} />
              </td>
              <td className="p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(job.id, job.title)}
                  disabled={deleteJob.isPending}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
