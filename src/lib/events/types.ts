/**
 * Shared Event Types
 * 
 * @serverOnly
 */

// ==================== Common Types ====================

export type EntityType = 'candidate' | 'company';

export interface EventDetails {
  title: string;
  description: string;
  metadata?: Record<string, any>;
}

// ==================== Candidate Events ====================

export type CandidateEventType =
  | 'EMAIL_SENT'
  | 'EMAIL_OPENED'
  | 'EMAIL_CLICKED'
  | 'NOTE'
  | 'CANDIDATE_IMPORTED'
  | 'CANDIDATE_CREATED'
  | 'CANDIDATE_VIEWED'
  | 'STATUS_CHANGED'
  | 'STATUS_CHANGE' // legacy spelling used by older writers
  | 'STAGE_CHANGED'
  | 'STAGE_CHANGE'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'CANDIDATE_ASSIGNED'
  | 'CALL_COMPLETED'
  | 'PIPELINE_MOVE'
  | 'JOB_LINKED'
  | 'JOB_UNLINKED'
  | 'JOB_STAGE_CHANGED'
  | 'PROFILE_UPDATED';

export interface CandidateEvent {
  // DynamoDB keys
  PK: string;                    // ENTITY#candidate#abc123
  SK: string;                    // EVENT#2025-05-29T20:15:33.456Z
  GSI1PK: string;               // TENANT#tenant-xyz
  GSI1SK: string;               // EVENT#2025-05-29T20:15:33.456Z
  
  // Tenant isolation
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  
  // Event data
  eventType: CandidateEventType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
}

export interface CandidateEventResult {
  // ID and keys
  id: string;
  entityId: string;
  entityType: EntityType;
  
  // Tenant isolation
  tenantId: string;
  
  // Event data
  eventType: CandidateEventType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
  timestamp: string;
}

// Helper to generate event keys
export const eventKeys = {
  forEntity: (type: EntityType, id: string) => `ENTITY#${type}#${id}`,
  eventSK: (timestamp?: string) => `EVENT#${timestamp || new Date().toISOString()}`,
  tenantGSI: (tenantId: string) => `TENANT#${tenantId}`,
};

export interface PaginationCursor {
  timestamp: string;
  eventId?: string;
}

export interface GetEventsResponse {
  events: CandidateEventResult[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
  totalCount?: number;
}

export interface GetCandidateEventsResponse {
  events: CandidateEventResult[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
  totalCount?: number;
}

export interface RecordEventResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface RecordCandidateEventResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

// ==================== Company Events ====================

export type CompanyEventType =
  | 'EMAIL_SENT'
  | 'EMAIL_OPENED'
  | 'EMAIL_CLICKED'
  | 'NOTE'
  | 'INVOICE_CREATED'
  | 'COMPANY_IMPORTED'
  | 'COMPANY_CREATED'
  | 'COMPANY_VIEWED'
  | 'CONTACT_ADDED'
  | 'CONTACT_REMOVED'
  | 'CONTACT_UPDATED'
  | 'PRIMARY_CONTACT_SET'
  | 'DEAL_CREATED'
  | 'DEAL_STAGE_CHANGED'
  | 'DEAL_WON'
  | 'DEAL_LOST'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'meeting_scheduled'
  | 'CALL_COMPLETED';

export interface CompanyEvent {
  PK: string;
  SK: string;
  companyId: string;
  eventType: CompanyEventType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
}

export interface CompanyEventResult {
  id: string;
  companyId: string;
  eventType: CompanyEventType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
  timestamp: string;
}

export interface GetCompanyEventsResponse {
  events: CompanyEventResult[];
  hasMore: boolean;
}

export interface RecordCompanyEventResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}
