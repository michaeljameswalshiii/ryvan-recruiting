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

  const jobsArray = Array.isArray(jobsDataRaw?.jobs) ? jobsDataRaw.jobs : 
                   Array.isArray(jobsDataRaw) ? jobsDataRaw : [];
  
  const jobs = jobsArray.map((item: any) => ({
    id: item.id || item.PK,
    title: item.title || "Untitled Job",
    companyName: item.companyName || "Unknown",
    status: item.status || "Open",
    candidates: Array.isArray(item.candidates) ? item.candidates : [],
  }));

  const activeJobs = jobs.filter(j => String(j.status || '').toLowerCase() !== 'closed');

  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobCompanyId, setNewJobCompanyId] = useState("");
  const [newJobCompanyName, setNewJobCompanyName] = useState("");

  const handleAddJob = async () => {
    if (!newJobTitle || !newJobCompanyId) {
      alert("Job Title and Company are required");
      return;
    }

    try {
      await createJobMutation.mutateAsync({
        title: newJobTitle,
        companyId: newJobCompanyId,
        companyName: newJobCompanyName || "Unknown",
        status: "Open"
      });

      setNewJobTitle("");
      setNewJobCompanyId("");
      setNewJobCompanyName("");
      setIsAddDialogOpen(false);
      refetch();
    } catch (err: any) {
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
          <p className="text-muted-foreground">Manage your job postings</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={refetch}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Job
          </Button>
        </div>
      </div>

      <JobListView jobs={activeJobs} />

      {/* Simple Add Dialog */}
      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Add New Job</h2>
            <input 
              type="text" 
              value={newJobTitle} 
              onChange={(e) => setNewJobTitle(e.target.value)}
              placeholder="Job Title" 
              className="w-full border p-3 rounded mb-4"
            />
            <select 
              value={newJobCompanyId} 
              onChange={(e) => {
                setNewJobCompanyId(e.target.value);
                const company = companies.find((c: any) => c.id === e.target.value);
                if (company) setNewJobCompanyName(company.name || "");
              }}
              className="w-full border p-3 rounded mb-6"
            >
              <option value="">Select Company</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleAddJob} className="flex-1">Create Job</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
