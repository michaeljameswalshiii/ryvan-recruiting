/**
 * Shared Event Types
 * 
 * @serverOnly
 */

// ==================== Common Types ====================

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
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED';

export interface CandidateEvent {
  PK: string;
  SK: string;
  candidateId: string;
  eventType: CandidateEventType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
}

export interface CandidateEventResult {
  id: string;
  candidateId: string;
  eventType: CandidateEventType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
  timestamp: string;
}

export interface GetCandidateEventsResponse {
  events: CandidateEventResult[];
  hasMore: boolean;
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
  | 'COMPANY_IMPORTED'
  | 'COMPANY_CREATED'
  | 'COMPANY_VIEWED'
  | 'CONTACT_ADDED'
  | 'CONTACT_REMOVED'
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
