'use client';

import { JobCard } from './JobCard';

type Stage = { id: string; label: string; color: string };

interface JobPipelineViewProps {
  stages: Stage[];
}

export function JobPipelineView({ stages }: JobPipelineViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stages.map((stage) => (
        <div key={stage.id} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{stage.label}</h3>
            <span className="text-xs bg-muted px-2 py-1 rounded">0</span>
          </div>
          
          <div className="space-y-3">
            {/* Example cards - connect to real data later */}
            <JobCard 
              title="Sr. Accountant" 
              company="RyVan Recruiting" 
              type="Full-time" 
              candidates={0} 
            />
          </div>
        </div>
      ))}
    </div>
  );
}
