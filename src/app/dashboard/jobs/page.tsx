'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const { data: jobsDataRaw, isLoading, error, refetch } = useJobs(true);
  const createJobMutation = useCreateJob();
  const { data: companies = [] } = useClients();

  const jobsData = jobsDataRaw && typeof jobsDataRaw === 'object' ? jobsDataRaw : { jobs: [] };
  const jobsArray = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
  
  const jobs = jobsArray.map((item: any) => ({
    id: item.id || item.PK,
    title: item.title || "",
    companyName: item.companyName || "",
    status: item.status || "Open",
    candidates: Array.isArray(item.candidates) ? item.candidates : [],
  }));

  const activeJobs = jobs.filter(job => 
    String(job.status || '').toLowerCase() !== 'closed'
  );

  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobCompanyId, setNewJobCompanyId] = useState("");
  const [newJobCompanyName, setNewJobCompanyName] = useState("");

  const handleAddJob = async () => {
    if (!newJobTitle || !newJobCompanyId) {
      alert("Title and Company are required");
      return;
    }
    // TODO: Call createJobMutation (implement later if needed)
    alert("Job creation placeholder - full implementation coming soon");
    setIsAddDialogOpen(false);
    refetch();
  };

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {String(error)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={refetch}>Refresh</Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Job
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}>List View</Button>
        <Button variant={viewMode === 'pipeline' ? 'default' : 'outline'} onClick={() => setViewMode('pipeline')}>Pipeline View</Button>
      </div>

      {viewMode === 'list' ? (
        <JobListView jobs={activeJobs} />
      ) : (
        <JobPipelineView stages={jobStages} jobs={activeJobs} />
      )}

      {/* Simple Add Dialog */}
      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Job"
      >
        <input 
          type="text" 
          value={newJobTitle} 
          onChange={(e) => setNewJobTitle(e.target.value)}
          placeholder="Job Title" 
          className="w-full border p-2 rounded mb-4"
        />
        <select 
          value={newJobCompanyId} 
          onChange={(e) => setNewJobCompanyId(e.target.value)}
          className="w-full border p-2 rounded mb-4"
        >
          <option value="">Select Company</option>
          {companies.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button onClick={handleAddJob} className="w-full">Create Job</Button>
      </SimpleDialog>
    </div>
  );
}
