'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { Plus, RefreshCw, ArrowLeft } from 'lucide-react';
import { 
  useJobs, 
  useCreateJob, 
  useUpdateJob, 
  jobKeys 
} from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { JobListView } from '@/components/jobs/JobListView';
import { JobPipelineView } from '@/components/jobs/JobPipelineView';
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
import {
  SearchableSelect,
  companyOptionsFromList,
} from '@/components/ui/searchable-select';

interface Job {
  id: string;
  title: string;
  description?: string;
  location?: string;
  salaryRange?: string;
  employmentType?: string;
  companyId?: string;
  companyName?: string;
  status: "Open" | "Paused" | "Filled" | "Lost" | "Closed";
  candidates?: Array<{
    candidateId: string;
    candidateName: string;
    stage: string;
    dateApplied: string;
  }>;
  createdAt?: string;
}

const jobStages = [
  { id: 'open', label: 'Open', color: 'bg-green-500' },
  { id: 'paused', label: 'Paused', color: 'bg-yellow-500' },
  { id: 'filled', label: 'Filled', color: 'bg-blue-500' },
  { id: 'lost', label: 'Lost', color: 'bg-rose-500' },
  { id: 'closed', label: 'Closed', color: 'bg-gray-500' },
];

export default function NewJobPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefilledCompanyId = searchParams.get('companyId');
  
  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const { data: companies = [] } = useClients();

  // Get the prefilled company name
  const prefilledCompany = companies.find((c: any) => c.id === prefilledCompanyId);
  const prefilledCompanyName = prefilledCompany?.name || '';

  // Form state for adding new job
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDescription, setNewJobDescription] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobSalary, setNewJobSalary] = useState("");
  const [newJobEmploymentType, setNewJobEmploymentType] = useState("Full-time");
  const [newJobCompanyId, setNewJobCompanyId] = useState(prefilledCompanyId || "");
  const [newJobCompanyName, setNewJobCompanyName] = useState(prefilledCompanyName);
  const [hiringManager, setHiringManager] = useState<HiringManagerFields>({});

  // Convert data to Job interface
  const jobsData: { jobs?: any[]; stats?: any } = jobsDataRaw && typeof jobsDataRaw === 'object' ? jobsDataRaw : { jobs: [] };
  const jobsArray = Array.isArray(jobsData?.jobs) ? jobsData.jobs : [];
  const jobs: Job[] = jobsArray.map((item: any) => ({
    id: item.id,
    title: item.title || "",
    description: item.description || "",
    location: item.location || "",
    salaryRange: item.salaryRange || "",
    employmentType: item.employmentType || "Full-time",
    companyId: item.company_id || item.companyId || "",
    companyName: item.companyName || "",
    status: (item.status as Job["status"]) || "Open",
    candidates: item.candidates || [],
    createdAt: item.created_at || new Date().toISOString(),
    showOnWebsite: item.showOnWebsite,
  }));

  // Filter active jobs
  const activeJobs = jobs.filter(job => {
    const status = (job.status || '').toLowerCase();
    return status !== 'closed';
  });

  console.log('✅ Prefilling companyId from contact:', prefilledCompanyId, prefilledCompanyName);

  // Handle add job
  const handleAddJob = async () => {
    if (!newJobTitle?.trim() || !newJobCompanyId?.trim()) {
      alert("Title and Company are required");
      return;
    }

    const company = companies.find(
      (c: any) =>
        String(c.id) === String(newJobCompanyId) ||
        String(c.PK) === String(newJobCompanyId)
    );
    const companyName =
      newJobCompanyName?.trim() ||
      company?.name ||
      company?.companyName ||
      "";

    if (!companyName) {
      alert("Please select a company from the dropdown");
      return;
    }

    try {
      // Success/error toasts come from useCreateJob
      const desc = (newJobDescription || '').trim();
      await createJobMutation.mutateAsync({
        title: newJobTitle.trim(),
        description: looksLikeHtml(desc)
          ? sanitizeJobHtml(desc)
          : normalizeJobDescriptionPaste(desc),
        location: newJobLocation,
        salaryRange: newJobSalary,
        employmentType: newJobEmploymentType,
        companyId: newJobCompanyId,
        companyName,
        status: "Open",
        ...hiringManager,
      });

      // Reset and go back
      setNewJobTitle("");
      setNewJobDescription("");
      setNewJobLocation("");
      setNewJobSalary("");
      setNewJobEmploymentType("Full-time");
      setNewJobCompanyId("");
      setNewJobCompanyName("");
      setHiringManager({});

      router.push('/dashboard/jobs');
    } catch (err: any) {
      console.error("Add job error:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create New Job</h1>
          <p className="text-muted-foreground">Add a new job opening and link it to a company</p>
        </div>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
      </Button>

      <h1 className="text-3xl font-bold mb-2">Create New Job</h1>
      <p className="text-muted-foreground mb-8">Add a new job opening and link it to a company</p>

      {/* Form */}
      <div
        data-ink-on-light
        className="grid gap-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 max-w-2xl text-slate-900"
      >
        <div className="grid gap-2">
          <Label htmlFor="title">Job Title *</Label>
          <Input
            id="title"
            value={newJobTitle}
            onChange={(e) => setNewJobTitle(e.target.value)}
            placeholder="Senior Software Engineer"
          />
        </div>
        
        {/* Company Selection - searchable typeahead */}
        <div className="grid gap-2">
          <Label htmlFor="company">Company *</Label>
          {companies.length > 0 ? (
            <SearchableSelect
              id="company"
              value={newJobCompanyId}
              onValueChange={(companyId) => {
                setNewJobCompanyId(companyId);
                const company = companies.find(
                  (c: any) =>
                    String(c.id) === String(companyId) ||
                    String(c.PK) === String(companyId)
                );
                setNewJobCompanyName(
                  company?.name || company?.companyName || ""
                );
                // Default to primary contact when company changes
                const contacts = Array.isArray(company?.contacts)
                  ? company.contacts
                  : [];
                const primary =
                  contacts.find((c: any) => c?.isPrimary) ||
                  (company?.primaryContactId
                    ? contacts.find(
                        (c: any) =>
                          String(c.id) === String(company.primaryContactId)
                      )
                    : null) ||
                  contacts[0] ||
                  null;
                if (primary) {
                  setHiringManager({
                    hiringManagerContactId: String(primary.id || ""),
                    hiringManagerName: String(primary.name || ""),
                    hiringManagerTitle: String(primary.title || ""),
                    hiringManagerEmail: String(primary.email || ""),
                    hiringManagerPhone: String(
                      primary.phone || primary.preferredPhone || ""
                    ),
                  });
                } else {
                  setHiringManager({});
                }
              }}
              options={companyOptionsFromList(companies)}
              placeholder="Select a company…"
              searchPlaceholder="Search companies…"
              required
            />
          ) : (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-3">
              No companies yet. Add a company first, then create the job.
            </p>
          )}
          {prefilledCompanyId && (
            <p className="text-sm text-muted-foreground">
              ✓ Pre-selected from contact
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="hiringManager">Contact / hiring manager</Label>
          <HiringManagerSelect
            companyId={newJobCompanyId}
            valueContactId={hiringManager.hiringManagerContactId}
            onChange={setHiringManager}
          />
          <p className="text-xs text-muted-foreground">
            Pick a company contact for this req. Defaults to primary when you
            select a company.
          </p>
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
          <Label>Description</Label>
          <JobDescriptionEditor
            value={newJobDescription}
            onChange={setNewJobDescription}
            minHeight={220}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button 
            onClick={handleAddJob}
            disabled={!newJobTitle || !newJobCompanyId || createJobMutation.isPending}
          >
            {createJobMutation.isPending ? "Creating..." : "Create Job"}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
