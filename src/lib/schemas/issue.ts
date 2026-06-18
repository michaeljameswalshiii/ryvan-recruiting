export interface Issue {
  id: string;
  tenantId: string;
  issueId: string; // e.g. "ISS-001"
  title: string;
  description?: string;
  issueType: 'Defect' | 'Enhancement';
  priority: 1 | 2 | 3 | 4; // 1=Critical, 4=Low
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

export type CreateIssueInput = Omit<Issue, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'issueId'> & {
  issueId?: string;
};

export type UpdateIssueInput = Partial<CreateIssueInput> & { id: string };
