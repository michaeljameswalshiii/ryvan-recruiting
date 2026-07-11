'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useJobs, useCreateJob } from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';

export default function JobsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const { data: companies = [] } = useClients();

  // Force jobs to always be an array
  const jobsArray = Array.isArray(jobsDataRaw?.jobs) ? jobsDataRaw.jobs : 
                   Array.isArray(jobsDataRaw) ? jobsDataRaw : [];
  
  const jobs = jobsArray.map((item: any) => ({
    id: item.id || item.PK,
    title: item.title || "Untitled Job",
    companyName: item.companyName || "Unknown",
    status: item.status || "Open",
    candidates: Array.isArray(item.candidates) ? item.candidates : [],
  }));

  const activeJobs = Array.isArray(jobs) ? jobs.filter(j => String(j.status || '').toLowerCase() !== 'closed') : [];

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
        companyName: newJobCompanyName || "Unknown Company",
        status: "Open"
      });

      setNewJobTitle("");
      setNewJobCompanyId("");
      setNewJobCompanyName("");
      setIsAddDialogOpen(false);
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
          <h1 className="text-3xl font-bold">Jobs</h1>
          <p className="text-muted-foreground">Active job postings</p>
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

      {/* Add Job Dialog */}
      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Add New Job</h2>
            
            <div className="space-y-4">
              <div>
                <Label>Job Title *</Label>
                <Input value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)} placeholder="Senior Software Engineer" />
              </div>
              <div>
                <Label>Company *</Label>
                <select 
                  value={newJobCompanyId} 
                  onChange={(e) => {
                    setNewJobCompanyId(e.target.value);
                    const company = companies.find((c: any) => c.id === e.target.value);
                    if (company) setNewJobCompanyName(company.name || "");
                  }}
                  className="w-full border p-3 rounded"
                >
                  <option value="">Select Company</option>
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleAddJob} className="flex-1" disabled={createJobMutation.isPending}>
                {createJobMutation.isPending ? "Creating..." : "Create Job"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
