export interface IssueAttachment {
  id: string;
  url: string; // data URL, presigned URL, or https URL for download
  s3Key?: string; // permanent key when stored in S3
  name: string;
  type?: string;
  size?: number;
  uploadedBy?: string;
  uploadedByEmail?: string;
  uploadedAt?: string;
}

export interface IssueComment {
  id: string;
  body: string;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  createdAt: string;
}

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
  attachments?: IssueAttachment[];
  comments?: IssueComment[];
  createdAt: string;
  updatedAt: string;
}

export type CreateIssueInput = Omit<
  Issue,
  'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'issueId'
> & {
  issueId?: string;
};

export type UpdateIssueInput = Partial<CreateIssueInput> & { id: string };
