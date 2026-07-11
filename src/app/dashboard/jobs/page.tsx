'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useJobs } from '@/lib/hooks/query-job';
import { JobListView } from '@/components/jobs/JobListView';

export default function JobsPage() {
  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);

  // Force safe array
  const jobs = Array.isArray(jobsDataRaw?.jobs) ? jobsDataRaw.jobs : 
              Array.isArray(jobsDataRaw) ? jobsDataRaw : [];

  const activeJobs = jobs.map((item: any) => ({
    id: item.id || item.PK,
    title: item.title || "Untitled Job",
    companyName: item.companyName || "Unknown",
    status: item.status || "Open",
  }));

  const handleTestAdd = () => {
    alert("Add Job clicked - real implementation coming soon.");
    refetch();
  };

  if (isLoading) return <div className="p-8">Loading jobs...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {String(error)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings</p>
        </div>
        <Button onClick={handleTestAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Job
        </Button>
      </div>

      <JobListView jobs={activeJobs} />
    </div>
  );
}
