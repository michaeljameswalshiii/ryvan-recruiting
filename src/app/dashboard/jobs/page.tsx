'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Jobs Pipeline</h1>
          <p className="text-muted-foreground">Manage your job postings and track candidates.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Job
          </Button>
        </div>
      </div>

      {/* View Toggle - Centered like Candidates/Companies */}
      <div className="flex justify-center">
        <div className="inline-flex bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            onClick={() => setViewMode('list')}
            className="px-6"
          >
            List
          </Button>
          <Button
            variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
            onClick={() => setViewMode('pipeline')}
            className="px-6"
          >
            Pipeline
          </Button>
        </div>
      </div>

      {/* Stats Pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total Jobs', value: '2' },
          { label: 'Open', value: '2' },
          { label: 'On Hold', value: '0' },
          { label: 'Filled', value: '0' },
          { label: 'Closed', value: '0' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
            <span className="text-muted-foreground">{stat.label}:</span>{' '}
            <span className="font-semibold">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Main Content */}
      {viewMode === 'list' ? <JobListView /> : <JobPipelineView stages={jobStages} />}
    </div>
  );
}
