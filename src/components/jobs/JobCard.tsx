'use client';

import Link from 'next/link';

interface JobCardProps {
  title: string;
  company: string;
  type: string;
  candidates: number;
  jobId?: string;
}

export function JobCard({ title, company, type, candidates, jobId }: JobCardProps) {
  const href = jobId ? `/dashboard/jobs/${jobId}` : '/dashboard/jobs';
  
  return (
    <Link 
      href={href}
      className="block bg-background border border-border rounded-xl p-4 hover:border-primary/50 transition-colors cursor-pointer"
    >
      <h4 className="font-medium">{title}</h4>
      <p className="text-blue-400 text-sm mt-1">{company}</p>
      
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded">{type}</span>
        <span className="text-xs text-muted-foreground">{candidates} candidates</span>
      </div>
    </Link>
  );
}
