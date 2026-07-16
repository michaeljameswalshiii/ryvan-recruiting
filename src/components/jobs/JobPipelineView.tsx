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

function matchStage(status: string, stageId: string): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
  if (stageId === 'open') return s === 'open' || s === 'active' || s === 'hiring';
  if (stageId === 'paused' || stageId === 'on_hold')
    return s === 'paused' || s === 'on hold' || s === 'hold' || s === 'pause';
  if (stageId === 'filled')
    return s === 'filled' || s === 'placed' || s === 'hired' || s === 'won';
  if (stageId === 'lost')
    return s === 'lost' || s === 'cancelled' || s === 'canceled';
  if (stageId === 'closed') return s === 'closed' || s === 'close' || s === 'ended';
  return false;
}

export function JobPipelineView({ stages, jobs }: JobPipelineViewProps) {
  const getJobsByStage = (stageId: string) => {
    return jobs.filter((j) => matchStage(j.status, stageId));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
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
