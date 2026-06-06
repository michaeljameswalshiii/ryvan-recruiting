'use client';

import { Briefcase } from 'lucide-react';

interface JobCardProps {
  title: string;
  company: string;
  type: string;
  candidates: number;
}

export function JobCard({ title, company, type, candidates }: JobCardProps) {
  return (
    <div className="bg-background border border-border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground">{company}</p>
        </div>
        <Briefcase className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded">{type}</span>
        <span className="text-xs text-muted-foreground">{candidates} candidate{candidates !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
