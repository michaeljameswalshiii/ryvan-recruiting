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
