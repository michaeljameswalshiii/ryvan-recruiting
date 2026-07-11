'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SimpleDialog } from '@/components/ui/simple-dialog';
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
    candidates: Array.isArray(item.candidates) ? item.candidates : [],
  }));

  const activeJobs = jobs.filter(j => String(j.status || '').toLowerCase() !== 'closed');

  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDescription, setNewJobDescription] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobSalary, setNewJobSalary] = useState("");
  const [newJobEmploymentType, setNewJobEmploymentType] = useState("Full-time");
  const [newJobCompanyId, setNewJobCompanyId] = useState("");
  const [newJobCompanyName, setNewJobCompanyName] = useState("");

  const handleAddJob = async () => {
    if (!newJobTitle || !newJobCompanyId || !newJobCompanyName) {
      alert("Job Title, Company ID, and Company Name are required");
      return;
    }

    try {
      await createJobMutation.mutateAsync({
        title: newJobTitle,
        description: newJobDescription,
        location: newJobLocation,
        salaryRange: newJobSalary,
        employmentType: newJobEmploymentType,
        companyId: newJobCompanyId,
        companyName: newJobCompanyName,
        status: "Open"
      });

      setNewJobTitle("");
      setNewJobDescription("");
      setNewJobLocation("");
      setNewJobSalary("");
      setNewJobEmploymentType("Full-time");
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
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
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

      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Job"
        description="Create a new job posting."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddJob} disabled={createJobMutation.isPending}>
              {createJobMutation.isPending ? "Creating..." : "Create Job"}
            </Button>
          </>
        }
      >
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
              className="w-full border rounded p-2"
            >
              <option value="">Select a company</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={newJobDescription} onChange={(e) => setNewJobDescription(e.target.value)} />
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
