/**
 * Jobs Page
 * Kanban board for managing Jobs with linked candidates
 * Displays jobs by status (Open, On Hold, Closed)
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, MoreHorizontal, MapPin, DollarSign, Users, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  useJobs, 
  useCreateJob, 
  useUpdateJob, 
  jobKeys 
} from "@/lib/hooks/query-job";
import { useClients } from "@/lib/hooks/query-client";

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

// Job status columns
const columns = [
  { id: "Open", title: "Open Positions", color: "bg-green-500" },
  { id: "On Hold", title: "On Hold", color: "bg-yellow-500" },
  { id: "Closed", title: "Closed", color: "bg-gray-500" },
];

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Use TanStack Query hooks
  const { data: jobsData, isLoading, error } = useJobs(true);
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

  // Get jobs by status
  const getJobsByStatus = (status: string) => {
    return jobs.filter((job) => job.status === status);
  };

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
        status: "Open",
      });

      setIsAddDialogOpen(false);
      resetForm();
      alert("Job created successfully!");
    } catch (err: any) {
      console.error("[JOBS-PAGE] Add job error:", err);
      alert(`Failed to add job: ${err?.message || err?.error || "Unknown error"}`);
    }
  };

  // Handle update job status
  const handleUpdateJobStatus = async (jobId: string, newStatus: string) => {
    try {
      await updateJobMutation.mutateAsync({
        jobId,
        jobData: { status: newStatus as "Open" | "On Hold" | "Closed" },
      });
    } catch (err: any) {
      console.error("[JOBS-PAGE] Update status error:", err);
    }
  };

  // Reset form
  const resetForm = () => {
    setNewJobTitle("");
    setNewJobDescription("");
    setNewJobLocation("");
    setNewJobSalary("");
    setNewJobEmploymentType("Full-time");
    setNewJobCompanyId("");
    setNewJobCompanyName("");
  };

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // Get column count
  const getColumnCount = (status: string) => {
    return jobs.filter((job) => job.status === status).length;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {columns.map((col) => (
            <div key={col.id} className="flex-shrink-0 w-80">
              <div className="flex items-center gap-2 mb-3">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <h3 className="font-medium">{col.title}</h3>
              </div>
              <div className="space-y-3 min-h-[400px] p-2 rounded-lg bg-muted/50">
                {[1, 2].map((i) => (
                  <div key={i} className="p-3 rounded-md bg-background border">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

// Error state
  if (error) {
    console.error('[JOBS-PAGE] Error:', error);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load jobs. Please try again.
          <br />
          <span className="text-xs">Error: {error?.message}</span>
          <br />
          <span className="text-xs text-muted-foreground">
            Error Details: {error?.details || 'See server logs'}
          </span>
          <Button variant="outline" onClick={handleRefresh} className="ml-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">
            Manage your job postings and track candidates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={createJobMutation.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {createJobMutation.isPending ? "Creating..." : "Add Job"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {jobsData?.stats && (
        <div className="flex gap-4 text-sm">
          <Badge variant="outline" className="px-3 py-1">
            Total Jobs: {jobsData.stats.totalJobs}
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Open: {jobsData.stats.openJobs}
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            With Candidates: {jobsData.stats.jobsWithCandidates}
          </Badge>
          <Badge variant="outline" className="px-3 py-1">
            Total Applications: {jobsData.stats.totalCandidateApplications}
          </Badge>
        </div>
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
                // Find company name
                const company = companies.find((c: any) => c.id === e.target.value);
                if (company) {
                  setNewJobCompanyName(company.name || "");
                }
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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

      {/* Jobs Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex-shrink-0 w-80"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${column.color}`} />
                <h3 className="font-medium">{column.title}</h3>
              </div>
              <span className="text-sm text-muted-foreground">
                {getColumnCount(column.id)}
              </span>
            </div>

            <div className="space-y-3 min-h-[400px] p-2 rounded-lg bg-muted/50">
              {getJobsByStatus(column.id).map((job) => (
                <div
                  key={job.id}
                  className="p-3 rounded-md bg-background border border-border cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    setSelectedJob(job);
                    setIsEditDialogOpen(true);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{job.title}</h4>
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Company */}
                  {job.companyName && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <Building2 className="h-3 w-3" />
                      {job.companyName}
                    </div>
                  )}

                  {/* Location */}
                  {job.location && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <MapPin className="h-3 w-3" />
                      {job.location}
                    </div>
                  )}

                  {/* Salary */}
                  {job.salaryRange && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <DollarSign className="h-3 w-3" />
                      {job.salaryRange}
                    </div>
                  )}

                  {/* Candidates count */}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {job.candidates?.length || 0} candidate{(job.candidates?.length || 0) !== 1 ? 's' : ''}
                  </div>

                  {/* Employment Type Badge */}
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {job.employmentType || 'Full-time'}
                    </Badge>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : ''}
                  </p>
                </div>
              ))}

              {getJobsByStatus(column.id).length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No jobs in this stage
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
