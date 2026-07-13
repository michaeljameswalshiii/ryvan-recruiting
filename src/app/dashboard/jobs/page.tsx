'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useJobs, useCreateJob } from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';
import { toast } from "sonner";

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

  const [formData, setFormData] = useState({
    title: '',
    companyId: '',
    companyName: '',
    description: '',
    salaryRange: '',
    status: 'Open',
  });

  const handleAddJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Job title is required");
      return;
    }

    try {
      await createJobMutation.mutateAsync({
        title: formData.title.trim(),
        companyId: formData.companyId.trim(),
        companyName: formData.companyName.trim() || "Unknown",
        description: formData.description.trim(),
        salaryRange: formData.salaryRange.trim(),
        status: formData.status,
      });

      toast.success("Job created successfully!");
      setIsAddDialogOpen(false);
      setFormData({ title: '', companyId: '', companyName: '', description: '', salaryRange: '', status: 'Open' });
      refetch();
    } catch (err: any) {
      console.error("Add job error:", err);
      toast.error(`Failed to add job: ${err?.message || 'Unknown error'}`);
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

      {/* Add Job Modal */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Job</DialogTitle>
            <DialogDescription>Fill in the job details.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddJobSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Job Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Senior Software Engineer"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyId">Company ID</Label>
                <Input
                  id="companyId"
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  placeholder="company-123"
                />
              </div>
              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Job responsibilities..."
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="salaryRange">Salary Range</Label>
              <Input
                id="salaryRange"
                value={formData.salaryRange}
                onChange={(e) => setFormData({ ...formData, salaryRange: e.target.value })}
                placeholder="$80k - $120k"
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border border-input rounded-md p-2"
              >
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Job</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
