'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { Badge } from '@/components/ui/badge';
import { 
  useJobs, 
  useCreateJob, 
  useUpdateJob, 
  jobKeys 
} from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';
import { JobPipelineView } from '@/components/jobs/JobPipelineView';
import { Building2, MapPin, DollarSign, Users, MoreHorizontal } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  description?: string;
  location?: string;
  salaryRange?: string;
  employmentType?: string;
  companyId?: string;
  companyName?: string;
  status: "Open" | "On Hold" | "Closed";
  candidates?: Array<{
    candidateId: string;
    candidateName: string;
    stage: string;
    dateApplied: string;
  }>;
  createdAt?: string;
}

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
  
  // Use TanStack Query hooks
  const { data: jobsData, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const updateJobMutation = useUpdateJob();
  const { data: companies = [] } = useClients();

  // Form state for adding new job
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDescription, setNewJobDescription] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobSalary, setNewJobSalary] = useState("");
  const [newJobEmploymentType, setNewJobEmploymentType] = useState("Full-time");
  const [newJobCompanyId, setNewJobCompanyId] = useState("");
  const [newJobCompanyName, setNewJobCompanyName] = useState("");

  // Convert data to Job interface
  const jobs: Job[] = (jobsData?.jobs || []).map((item: any) => ({
    id: item.id,
    title: item.title || "",
    description: item.description || "",
    location: item.location || "",
    salaryRange: item.salaryRange || "",
    employmentType: item.employmentType || "Full-time",
    companyId: item.companyId || "",
    companyName: item.companyName || "",
    status: (item.status as Job["status"]) || "Open",
    candidates: item.candidates || [],
    createdAt: item.created_at || new Date().toISOString(),
  }));

  // Get stats
  const totalJobs = jobs.length;
  const openJobs = jobs.filter(j => j.status === "Open").length;
  const onHoldJobs = jobs.filter(j => j.status === "On Hold").length;
  const filledJobs = jobs.filter(j => j.status === "Filled").length;
  const closedJobs = jobs.filter(j => j.status === "Closed").length;

  // Handle add job
  const handleAddJob = async () => {
    if (!newJobTitle || !newJobCompanyId || !newJobCompanyName) {
      alert("Title and Company are required");
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

      setIsAddDialogOpen(false);
      setNewJobTitle("");
      setNewJobDescription("");
      setNewJobLocation("");
      setNewJobSalary("");
      setNewJobEmploymentType("Full-time");
      setNewJobCompanyId("");
      setNewJobCompanyName("");
      alert("Job created successfully!");
    } catch (err: any) {
      console.error("Add job error:", err);
      alert(`Failed to add job: ${err?.message || err?.error || "Unknown error"}`);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    refetch();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>
        <div className="text-muted-foreground">Loading jobs...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load jobs. Please try again.
          <Button variant="outline" onClick={handleRefresh} className="ml-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={createJobMutation.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {createJobMutation.isPending ? "Creating..." : "Add Job"}
          </Button>
        </div>
      </div>

      {/* View Toggle - Centered like Candidates/Companies */}
      <div className="flex justify-center">
        <div className="inline-flex bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            onClick={() => setViewMode('list')}
            className="px-6"
          >
            List
          </Button>
          <Button
            variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
            onClick={() => setViewMode('pipeline')}
            className="px-6"
          >
            Pipeline
          </Button>
        </div>
      </div>

      {/* Stats Pills */}
      <div className="flex flex-wrap gap-2">
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total Jobs:</span>{' '}
          <span className="font-semibold">{totalJobs}</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Open:</span>{' '}
          <span className="font-semibold">{openJobs}</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">On Hold:</span>{' '}
          <span className="font-semibold">{onHoldJobs}</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Filled:</span>{' '}
          <span className="font-semibold">{filledJobs}</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Closed:</span>{' '}
          <span className="font-semibold">{closedJobs}</span>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'list' ? (
        <JobListView jobs={jobs} />
      ) : (
        <JobPipelineView stages={jobStages} jobs={jobs} />
      )}

      {/* Add Job Dialog */}
      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Job"
        description="Create a new job posting."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddJob}
              disabled={!newJobTitle || !newJobCompanyId || createJobMutation.isPending}
            >
              {createJobMutation.isPending ? "Creating..." : "Create Job"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Job Title *</Label>
            <Input
              id="title"
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              placeholder="Senior Software Engineer"
            />
          </div>
          
          {/* Company Selection */}
          <div className="grid gap-2">
            <Label htmlFor="company">Company *</Label>
            <select
              id="company"
              value={newJobCompanyId}
              onChange={(e) => {
                setNewJobCompanyId(e.target.value);
                const company = companies.find((c: any) => c.id === e.target.value);
                if (company) {
                  setNewJobCompanyName(company.name || "");
                }
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a company...</option>
              {companies.map((company: any) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={newJobLocation}
              onChange={(e) => setNewJobLocation(e.target.value)}
              placeholder="San Francisco, CA or Remote"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="salary">Salary Range</Label>
            <Input
              id="salary"
              value={newJobSalary}
              onChange={(e) => setNewJobSalary(e.target.value)}
              placeholder="$120,000 - $150,000"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="employmentType">Employment Type</Label>
            <select
              id="employmentType"
              value={newJobEmploymentType}
              onChange={(e) => setNewJobEmploymentType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={newJobDescription}
              onChange={(e) => setNewJobDescription(e.target.value)}
              placeholder="Job description..."
              rows={4}
            />
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
