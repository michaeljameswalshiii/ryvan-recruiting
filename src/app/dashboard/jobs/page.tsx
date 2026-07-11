'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useJobs, useCreateJob } from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';

export default function JobsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const { data: companies = [] } = useClients();

  const jobsArray = Array.isArray(jobsDataRaw?.jobs) ? jobsDataRaw.jobs : Array.isArray(jobsDataRaw) ? jobsDataRaw : [];
  
  const jobs = jobsArray.map((item: any) => ({
    id: item.id || item.PK,
    title: item.title || "Untitled Job",
    companyName: item.companyName || "Unknown",
    status: item.status || "Open",
  }));

  const activeJobs = jobs.filter(j => String(j.status || '').toLowerCase() !== 'closed');

  const handleAddJob = async () => {
    const title = prompt("Enter Job Title:");
    if (!title) return;

    const companyId = prompt("Enter Company ID (from Companies page):");
    if (!companyId) return;

    const companyName = prompt("Enter Company Name:") || "Unknown";

    try {
      await createJobMutation.mutateAsync({
        title,
        companyId,
        companyName,
        status: "Open"
      });

      alert("Job created successfully!");
      refetch();
    } catch (err: any) {
      console.error("Add job error:", err);
      alert(`Failed to add job: ${err?.message || 'Unknown error'}`);
    }
  };

  if (isLoading) return <div className="p-8">Loading jobs...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {String(error)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={refetch}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={handleAddJob}>
            <Plus className="mr-2 h-4 w-4" /> Add Job
          </Button>
        </div>
      </div>

      <JobListView jobs={activeJobs} />
    </div>
  );
}
