/**
 * Candidate Events Types
 * 
 * @serverOnly
 */

// Event Types
export type EventType = 
  | 'EMAIL_SENT' 
  | 'NOTE' 
  | 'STATUS_CHANGE' 
  | 'INTERVIEW_SCHEDULED'
  | 'CANDIDATE_IMPORTED';

// Event metadata for different event types
export interface EmailSentMetadata {
  emailSubject?: string;
  emailTo?: string;
  emailFrom?: string;
  templateId?: string;
  messageId?: string;
}

export interface NoteMetadata {
  noteText: string;
  changedBy: string;
}

export interface StatusChangeMetadata {
  oldStatus?: string;
  newStatus: string;
  changedBy: string;
}

export interface InterviewScheduledMetadata {
  interviewDate?: string;
  interviewType?: string;
  interviewers?: string[];
  changedBy?: string;
}

// Metadata for candidate imported from AI/Apollo
export interface ImportedMetadata {
  source: string;           // 'apollo', 'ai_search', 'manual', etc.
  confidence?: number;       // AI confidence score (0-1)
  rawData?: any;           // Original raw data from AI
  searchQuery?: string;    // Original search query used
  importedBy: string;      // User who imported
}

// Union type for all metadata
export type EventMetadata = 
  | EmailSentMetadata 
  | NoteMetadata 
  | StatusChangeMetadata 
  | InterviewScheduledMetadata;

// Event details for creating events
export interface EventDetails {
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

// The full event record stored in DynamoDB
export interface CandidateEvent {
  PK: string;           // CANDIDATE#{candidateId}
  SK: string;           // EVENT#{timestamp}
  candidateId: string;
  eventType: EventType;
  title: string;
  description?: string;
  metadata: Record<string, any>;
  createdAt: string;     // ISO timestamp
  createdBy: string;   // user email or id
}

// Result type for querying events
export interface CandidateEventResult extends Omit<CandidateEvent, 'PK' | 'SK'> {
  id: string;
  timestamp: string;
}

// Response types
export interface GetEventsResponse {
  events: CandidateEventResult[];
  hasMore: boolean;
}

export interface RecordEventResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

// ============================================================================
// Company Events Types
// ============================================================================

// Company Event Types
export type CompanyEventType = 
  | 'NOTE' 
  | 'STATUS_CHANGE'
  | 'COMPANY_ADDED'
  | 'CONTACT_ADDED';

// Company Event metadata for different event types
export interface CompanyNoteMetadata {
  noteText: string;
  changedBy: string;
}

export interface CompanyStatusChangeMetadata {
  oldStatus?: string;
  newStatus: string;
  changedBy: string;
}

export interface CompanyAddedMetadata {
  companyName: string;
  addedBy: string;
}

export interface ContactAddedMetadata {
  contactName: string;
  addedBy: string;
}

// Union type for all company event metadata
export type CompanyEventMetadata = 
  | CompanyNoteMetadata 
  | CompanyStatusChangeMetadata 
  | CompanyAddedMetadata
  | ContactAddedMetadata;

// The full company event record stored in DynamoDB
export interface CompanyEvent {
  PK: string;           // COMPANY#{companyId}
  SK: string;           // EVENT#{timestamp}
  companyId: string;
  eventType: CompanyEventType;
  title: string;
  description?: string;
  metadata: Record<string, any>;
  createdAt: string;     // ISO timestamp
  createdBy: string;   // user email or id
}

// Result type for querying company events
export interface CompanyEventResult extends Omit<CompanyEvent, 'PK' | 'SK'> {
  id: string;
  timestamp: string;
}

// Company Events Response types
export interface GetCompanyEventsResponse {
  events: CompanyEventResult[];
  hasMore: boolean;
}

export interface RecordCompanyEventResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}
