'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { JobDescriptionEditor } from '@/components/job/JobDescriptionEditor';
import {
  looksLikeHtml,
  sanitizeJobHtml,
} from '@/lib/careers/sanitize-job-html';
import { normalizeJobDescriptionPaste } from '@/lib/careers/format-description';
import { toast } from 'sonner';
import {
  SearchableSelect,
  companyOptionsFromList,
} from '@/components/ui/searchable-select';

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
    const company = companies.find(
      (c: any) =>
        String(c.id) === String(companyId) || String(c.PK) === String(companyId)
    );
    const companyName =
      company?.name || company?.companyName || '';
    setFormData({
      ...formData,
      companyId,
      companyName,
    });
    // Prefer primary contact as default hiring manager when company changes
    const contacts = Array.isArray(company?.contacts) ? company.contacts : [];
    const primary =
      contacts.find((c: any) => c?.isPrimary) ||
      (company?.primaryContactId
        ? contacts.find((c: any) => String(c.id) === String(company.primaryContactId))
        : null) ||
      contacts[0] ||
      null;
    if (primary) {
      setHiringManager({
        hiringManagerContactId: String(primary.id || ''),
        hiringManagerName: String(primary.name || ''),
        hiringManagerTitle: String(primary.title || ''),
        hiringManagerEmail: String(primary.email || ''),
        hiringManagerPhone: String(
          primary.phone || primary.preferredPhone || ''
        ),
      });
    } else {
      setHiringManager({});
    }
  };

  const handleAddJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Job title is required');
      return;
    }
    if (!formData.companyId.trim()) {
      toast.error('Please select a company');
      return;
    }

    const company =
      companies.find(
        (c: any) =>
          String(c.id) === String(formData.companyId) ||
          String(c.PK) === String(formData.companyId)
      ) || null;
    const companyName =
      formData.companyName.trim() ||
      company?.name ||
      company?.companyName ||
      '';

    if (!companyName) {
      toast.error('Please select a company from the list');
      return;
    }

    try {
      // Toasts for success/error are handled by useCreateJob
      await createJobMutation.mutateAsync({
        title: formData.title.trim(),
        companyId: formData.companyId.trim(),
        companyName,
        description: (() => {
          const d = formData.description.trim();
          return looksLikeHtml(d)
            ? sanitizeJobHtml(d)
            : normalizeJobDescriptionPaste(d);
        })(),
        salaryRange: formData.salaryRange.trim(),
        status: formData.status,
        showOnWebsite: formData.showOnWebsite,
        ...hiringManager,
      });

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
      // useCreateJob already toasts; keep a console trail only
      console.error('Add job error:', err);
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

      {/* Add Job Modal — scrollable body + sticky footer so short viewports can reach Create */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(92vh,900px)] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 pr-12 shrink-0 border-b">
            <DialogTitle>Add New Job</DialogTitle>
            <DialogDescription>Fill in the job details.</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleAddJobSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
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

              <div>
                <Label htmlFor="companyId">Company *</Label>
                {companies.length > 0 ? (
                  <SearchableSelect
                    id="companyId"
                    value={formData.companyId}
                    onValueChange={handleCompanySelect}
                    options={companyOptionsFromList(companies)}
                    placeholder="Select company…"
                    searchPlaceholder="Search companies…"
                    required
                  />
                ) : (
                  <div className="rounded-md border border-dashed border-input px-3 py-3 text-sm text-muted-foreground">
                    No companies yet.{' '}
                    <button
                      type="button"
                      className="text-blue-600 hover:underline font-medium"
                      onClick={() => {
                        setIsAddDialogOpen(false);
                        router.push('/dashboard/companies');
                      }}
                    >
                      Add a company
                    </button>{' '}
                    first, then create the job.
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="hiringManager">Contact / hiring manager</Label>
                <HiringManagerSelect
                  companyId={formData.companyId}
                  valueContactId={hiringManager.hiringManagerContactId}
                  onChange={setHiringManager}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional. Pick a company contact for this req (defaults to
                  primary when you select a company).
                </p>
              </div>

              <div>
                <Label className="mb-1.5 block">Description</Label>
                <JobDescriptionEditor
                  value={formData.description}
                  onChange={(description) =>
                    setFormData((prev) => ({ ...prev, description }))
                  }
                  minHeight={200}
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
            </div>

            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 sm:space-x-2">
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
