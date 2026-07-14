# Issues Tracking System - Full To-Do List

## PHASE 0: Infrastructure (Mostly Done)

### Task 0.1 – Create Table Definition
- File: `create-issues-table.json` (already provided earlier)

### Task 0.2 – CDK Stack Update
- File: `cdk/stacks/dynamodb.py` (already provided)

### Task 0.3 – DynamoDB Client Mapping
- File: `src/lib/db/dynamodb.ts` (already done)

---

## PHASE 1: Core Backend

### Task 1.1 – Schema (Done)
- File: `src/lib/schemas/issue.ts`

```ts
export interface Issue {
  id: string;
  tenantId: string;
  issueId: string;           // e.g. "ISS-001"
  title: string;
  description?: string;
  issueType: 'Defect' | 'Enhancement';
  priority: 1 | 2 | 3 | 4;   // 1=Critical, 4=Low
  severity?: string;
  mvp?: boolean;
  featureArea?: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  reportedBy?: string;
  assignedTo?: string[];
  environment?: 'Dev' | 'QA' | 'Prod';
  tags?: string[];
  attachments?: Array<{
    url: string;
    name: string;
    type?: string;
    size?: number;
  }>;
  comments?: any[];
  createdAt: string;
  updatedAt: string;
}

export type CreateIssueInput = Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'issueId'> & {
  issueId?: string;
};

export type UpdateIssueInput = Partial<CreateIssueInput> & { id: string };
```

### Task 1.2 – Repository (Done)
- File: `src/lib/db/repositories/issue-repository.ts` (already provided in previous message)

### Task 1.3 – Server Actions
- File: `src/lib/actions/issue-actions.ts` (Create new file)

```ts
'use server';

import { issueRepository } from '../db/repositories/issue-repository';
import { CreateIssueInput, UpdateIssueInput } from '../schemas/issue';
import { getTenantId } from '@/lib/auth/tenant'; // reuse existing tenant helper
import { revalidatePath } from 'next/cache';

export async function createIssue(data: CreateIssueInput) {
  const tenantId = await getTenantId();
  if (!tenantId) throw new Error('Unauthorized');

  const issue = await issueRepository.create(data, tenantId);
  revalidatePath('/dashboard/issues');
  return issue;
}

export async function listIssues(status?: string) {
  const tenantId = await getTenantId();
  if (!tenantId) return [];

  return issueRepository.listByTenant(tenantId, status);
}

export async function getIssue(id: string) {
  const tenantId = await getTenantId();
  if (!tenantId) return null;

  return issueRepository.getById(id, tenantId);
}

// Update + Delete can be added in Phase 2
```

### Task 1.4 – TanStack Query Hooks
- File: `src/lib/hooks/query-issue.ts` (Create new file)

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createIssue, listIssues } from '../actions/issue-actions';
import { CreateIssueInput } from '../schemas/issue';

export function useIssues(status?: string) {
  return useQuery({
    queryKey: ['issues', status],
    queryFn: () => listIssues(status),
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}
```

### Task 1.5 – Basic Issues List Page
- File: `src/app/dashboard/issues/page.tsx` (Create new)

```tsx
import { IssuesClient } from '@/components/issues/IssuesClient';

export default function IssuesPage() {
  return <IssuesClient />;
}
```

- File: `src/components/issues/IssuesClient.tsx` (Create new)

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useIssues, useCreateIssue } from '@/lib/hooks/query-issue';
import { SimpleDialog } from '@/components/ui/simple-dialog'; // reuse if exists

export default function IssuesClient() {
  const { data: issues = [], isLoading } = useIssues();
  const createIssue = useCreateIssue();
  const [isOpen, setIsOpen] = useState(false);

  // Form state for minimal create
  const [title, setTitle] = useState('');
  const [issueType, setIssueType] = useState<'Defect' | 'Enhancement'>('Defect');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(3);

  const handleCreate = async () => {
    if (!title) return;
    await createIssue.mutateAsync({
      title,
      issueType,
      priority,
      status: 'Open',
    });
    setIsOpen(false);
    setTitle('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Issues</h1>
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Issue
        </Button>
      </div>

      {/* Simple Table */}
      <div className="bg-white rounded-2xl border">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4">Issue ID</th>
              <th className="text-left p-4">Title</th>
              <th className="text-left p-4">Type</th>
              <th className="text-left p-4">Priority</th>
              <th className="text-left p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue: any) => (
              <tr key={issue.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-mono text-sm">{issue.issueId}</td>
                <td className="p-4">{issue.title}</td>
                <td className="p-4">{issue.issueType}</td>
                <td className="p-4">P{issue.priority}</td>
                <td className="p-4">{issue.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Dialog */}
      <SimpleDialog open={isOpen} onOpenChange={setIsOpen} title="Create New Issue">
        {/* Form fields here - expand as needed */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue Title"
          className="w-full border p-3 rounded"
        />
        {/* More fields... */}
        <Button onClick={handleCreate} className="mt-4">Create Issue</Button>
      </SimpleDialog>
    </div>
  );
}
