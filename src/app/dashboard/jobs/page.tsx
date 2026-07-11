'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { 
  useJobs, 
  useCreateJob 
} from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';
import { JobPipelineView } from '@/components/jobs/JobPipelineView';

const jobStages = [
  { id: 'open', label: 'Open Positions', color: 'bg-green-500' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-yellow-500' },
  { id: 'filled', label: 'Filled', color: 'bg-blue-500' },
  { id: 'closed', label: 'Closed', color: 'bg-gray-500' },
];

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const { data: companies = [] } = useClients();

  // Safe data handling
  const jobsData = jobsDataRaw && typeof jobsDataRaw === 'object' ? jobsDataRaw : { jobs: [] };
  const jobsArray = Array.isArray(jobsData?.jobs) ? jobsData.jobs : [];
  
  const jobs = jobsArray.map((item: any) => ({
    id: item.id || item.PK,
    title: item.title || "",
    description: item.description || "",
    location: item.location || "",
    salaryRange: item.salaryRange || "",
    employmentType: item.employmentType || "Full-time",
    companyId: item.companyId || item.company_id || "",
    companyName: item.companyName || "",
    status: (item.status || "Open"),
    candidates: Array.isArray(item.candidates) ? item.candidates : [],
    createdAt: item.createdAt || item.created_at,
  }));

  const activeJobs = jobs.filter(job => {
    const status = String(job.status || '').toLowerCase();
    return !['closed', 'filled'].includes(status);
  });

  const totalJobs = jobs.length;
  const openJobs = jobs.filter(j => String(j.status || '').toLowerCase() === 'open').length;
  const onHoldJobs = jobs.filter(j => String(j.status || '').toLowerCase() === 'on hold').length;

  // Form state
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

      // Reset form
      setNewJobTitle("");
      setNewJobDescription("");
      setNewJobLocation("");
      setNewJobSalary("");
      setNewJobEmploymentType("Full-time");
      setNewJobCompanyId("");
      setNewJobCompanyName("");
      setIsAddDialogOpen(false);

      refetch(); // Refresh list
    } catch (err: any) {
      console.error("Add job error:", err);
      alert(`Failed to add job: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleRefresh = () => refetch();

  if (isLoading) return <div className="p-8">Loading jobs...</div>;
  if (error) return <div className="p-8 text-red-600">Error loading jobs: {String(error)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Job
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <div className="bg-card border px-4 py-2 rounded-lg text-sm">
          Total: <span className="font-semibold">{totalJobs}</span>
        </div>
        <div className="bg-card border px-4 py-2 rounded-lg text-sm">
          Open: <span className="font-semibold">{openJobs}</span>
        </div>
        <div className="bg-card border px-4 py-2 rounded-lg text-sm">
          On Hold: <span className="font-semibold">{onHoldJobs}</span>
        </div>
      </div>

      {/* Views */}
      {viewMode === 'list' ? (
        <JobListView jobs={activeJobs} />
      ) : (
        <JobPipelineView stages={jobStages} jobs={activeJobs} />
      )}

      {/* Add Job Dialog */}
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
              <option value="">Select Company</option>
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
