'use client';

import { JobCard } from './JobCard';

interface Job {
  id: string;
  title: string;
  employmentType?: string;
  companyName?: string;
  status: string;
  candidates?: any[];
}

type Stage = { id: string; label: string; color: string };

interface JobPipelineViewProps {
  stages: Stage[];
  jobs: Job[];
}

export function JobPipelineView({ stages, jobs }: JobPipelineViewProps) {
  const getJobsByStage = (stageId: string) => {
    if (stageId === 'open') return jobs.filter(j => j.status === 'Open');
    if (stageId === 'on_hold') return jobs.filter(j => j.status === 'On Hold');
    if (stageId === 'filled') return jobs.filter(j => j.status === 'Filled');
    if (stageId === 'closed') return jobs.filter(j => j.status === 'Closed');
    return [];
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stages.map((stage) => {
        const stageJobs = getJobsByStage(stage.id);
        return (
          <div key={stage.id} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{stage.label}</h3>
              <span className="text-xs bg-muted px-2 py-1 rounded">{stageJobs.length}</span>
            </div>
            
            <div className="space-y-3">
              {stageJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs</p>
              ) : (
stageJobs.map((job) => (
                  <JobCard 
                    key={job.id}
                    jobId={job.id}
                    title={job.title} 
                    company={job.companyName || 'Company'} 
                    type={job.employmentType || 'Full-time'} 
                    candidates={job.candidates?.length || 0} 
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
