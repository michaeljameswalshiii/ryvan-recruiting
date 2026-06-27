/**
 * Events Index Barrel File
 * 
 * Central export point for all event-related modules
 * NOTE: Using explicit exports to avoid conflicting star exports between
 * candidate-events and company-events which both export:
 * - recordCallCompleted
 * - recordTaskCompleted
 * - recordTaskCreated
 * 
 * @serverOnly
 */

// Core types (no 'use server' needed for types)
export * from './types';

// Candidate events - explicit exports to avoid conflicts with company-events
export {
  recordEvent,
  getCandidateEvents,
  addNoteToCandidate,
  recordEmailSent,
  recordStatusChange,
  recordInterviewScheduled,
  recordCandidateImported,
  recordStageChange,
  recordTaskCreated,
  recordTaskCompleted,
  recordCandidateViewed,
  recordCandidateAssigned,
  recordCallCompleted,
  recordEmailOpened,
  recordEmailClicked,
  recordPipelineMove,
} from './candidate-events';

// Company events - explicit exports (excluding duplicates with candidate-events)
// Duplicates removed: recordTaskCreated, recordTaskCompleted, recordCallCompleted
export {
  recordCompanyEvent,
  getCompanyEvents,
  addNoteToCompany,
  recordEmailSentToCompany,
  recordEmailOpenedForCompany,
  recordEmailClickedForCompany,
  recordCompanyImported,
  recordCompanyCreated,
  recordCompanyViewed,
  recordContactAddedToCompany,
  recordContactRemovedFromCompany,
  recordContactUpdatedForCompany,
  recordPrimaryContactSetForCompany,
  recordDealCreated,
  recordDealStageChanged,
  recordDealWon,
  recordDealLost,
  recordMeetingScheduled,
} from './company-events';
