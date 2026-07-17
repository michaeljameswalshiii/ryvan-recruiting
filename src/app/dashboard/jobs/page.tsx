'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useJobs, useCreateJob } from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';
import {
  HiringManagerSelect,
  type HiringManagerFields,
} from '@/components/job/JobHiringManagerCard';
import { toast } from 'sonner';

export default function JobsPage() {
  const router = useRouter();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const { data: companiesData = [] } = useClients();

  const companies = useMemo(() => {
    if (Array.isArray(companiesData)) return companiesData;
    if (companiesData && Array.isArray((companiesData as any).clients)) {
      return (companiesData as any).clients;
    }
    return [];
  }, [companiesData]);

  const jobs = useMemo(() => {
    const jobsArray = Array.isArray(jobsDataRaw?.jobs)
      ? jobsDataRaw.jobs
      : Array.isArray(jobsDataRaw)
        ? jobsDataRaw
        : [];

    return jobsArray.map((item: any) => ({
      id: item.id || item.PK,
      title: item.title || 'Untitled Job',
      companyId: item.companyId,
      companyName: item.companyName || 'Unknown',
      status: item.status || 'Open',
      employmentType: item.employmentType || item.employment_type,
      candidates: Array.isArray(item.candidates) ? item.candidates : [],
      createdAt: item.created_at || item.createdAt,
      modifiedAt: item.modified_at || item.modifiedAt || item.updated_at,
      location: item.location,
      salaryRange: item.salaryRange || item.salary_range,
    }));
  }, [jobsDataRaw]);

  const [formData, setFormData] = useState({
    title: '',
    companyId: '',
    companyName: '',
    description: '',
    salaryRange: '',
    status: 'Open',
    showOnWebsite: false,
  });
  const [hiringManager, setHiringManager] = useState<HiringManagerFields>({});

  const handleCompanySelect = (companyId: string) => {
    const company = companies.find((c: any) => String(c.id) === String(companyId));
    setFormData({
      ...formData,
      companyId,
      companyName: company?.name || company?.companyName || formData.companyName,
    });
    setHiringManager({});
  };

  const handleAddJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Job title is required');
      return;
    }

    try {
      await createJobMutation.mutateAsync({
        title: formData.title.trim(),
        companyId: formData.companyId.trim(),
        companyName: formData.companyName.trim() || 'Unknown',
        description: formData.description.trim(),
        salaryRange: formData.salaryRange.trim(),
        status: formData.status,
        showOnWebsite: formData.showOnWebsite,
        ...hiringManager,
      });

      toast.success('Job created successfully!');
      setIsAddDialogOpen(false);
      setFormData({
        title: '',
        companyId: '',
        companyName: '',
        description: '',
        salaryRange: '',
        status: 'Open',
        showOnWebsite: false,
      });
      setHiringManager({});
      refetch();
    } catch (err: any) {
      console.error('Add job error:', err);
      toast.error(`Failed to add job: ${err?.message || 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500">Manage job postings and candidate pipelines</p>
        </div>
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="ml-3">Loading jobs...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Jobs</h1>
            <p className="text-sm text-gray-500">Manage job postings and candidate pipelines</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-red-600 text-lg font-semibold mb-2">Error Loading Jobs</div>
          <p className="text-red-600 text-sm">{String((error as Error).message || error)}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500">
            Manage job postings — click any card to filter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/dashboard/jobs/new')}
          >
            Full form
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Job
          </Button>
        </div>
      </div>

      <JobListView jobs={jobs} />

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
                <Label htmlFor="companyId">Company</Label>
                {companies.length > 0 ? (
                  <select
                    id="companyId"
                    value={formData.companyId}
                    onChange={(e) => handleCompanySelect(e.target.value)}
                    className="w-full h-10 border border-input rounded-md px-3 text-sm bg-background"
                  >
                    <option value="">Select company…</option>
                    {[...companies]
                      .sort((a: any, b: any) =>
                        String(a.name || '').localeCompare(String(b.name || ''))
                      )
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.companyName || c.id}
                        </option>
                      ))}
                  </select>
                ) : (
                  <Input
                    id="companyId"
                    value={formData.companyId}
                    onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                    placeholder="company-123"
                  />
                )}
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
              <Label>Hiring manager / contact</Label>
              <HiringManagerSelect
                companyId={formData.companyId}
                valueContactId={hiringManager.hiringManagerContactId}
                onChange={setHiringManager}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional. Choose a contact at the company for this req.
              </p>
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
                className="w-full border border-input rounded-md p-2 text-sm"
              >
                <option value="Open">Open</option>
                <option value="Paused">Paused</option>
                <option value="Filled">Filled</option>
                <option value="Lost">Lost</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <label className="flex items-start gap-2 rounded-md border border-input p-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={formData.showOnWebsite}
                onChange={(e) =>
                  setFormData({ ...formData, showOnWebsite: e.target.checked })
                }
              />
              <span>
                <span className="font-medium">Show on website</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  List this job on the public careers page and embeds when status is Open.
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createJobMutation.isPending}>
                {createJobMutation.isPending ? 'Creating…' : 'Create Job'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
