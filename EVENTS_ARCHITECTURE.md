# EVENTS_ARCHITECTURE.md

## Purpose
Track all status changes, notes, emails, and activities as immutable events for Candidates and Companies.

## Core Principles
- Append-only event log (never update/delete events)
- Strict tenant isolation
- High-velocity writes with efficient queries
- Unified event recorder used by all flows (Kanban, detail pages, email, etc.)

## DynamoDB Table: `turnkey-events`

Use single-table design with dedicated table.

**PK**: `ENTITY#${entityType}#${entityId}` (e.g. `CANDIDATE#cand-123abc`)
**SK**: `EVENT#${isoTimestampWithMs}` (newest first when queried with `ScanIndexForward: false`)

**GSI1** (Tenant-wide activity feed):
- GSI1PK: `TENANT#${tenantId}`
- GSI1SK: `EVENT#${isoTimestampWithMs}`

**Attributes** (see types below)

## Event Types (examples)
- `STATUS_CHANGED`
- `STAGE_CHANGED`
- `NOTE_ADDED`
- `EMAIL_SENT`
- `EMAIL_RECEIVED`
- `CANDIDATE_CREATED`
- `COMPANY_CREATED`
- `RESUME_UPLOADED`

## Implementation Steps (Do in this order)

1. ✅ Create DynamoDB table in CDK (see code below)
2. ✅ Create `src/lib/events/` folder with:
   - ✅ `types.ts` - Type definitions (EntityType, BaseEvent, CandidateEvent, CompanyEvent)
   - ✅ `index.ts` - Barrel file exporting all events
   - ✅ `candidate-events.ts` - Candidate event functions (addNote, recordStatusChange, etc.)
   - ✅ `company-events.ts` - Company event functions
3. ✅ Add hooks in Kanban drag-drop and detail modals
4. ✅ Build `EventTimeline` React component
   - ✅ `src/components/EventTimeline.tsx` - Reusable component for both candidates & companies
   - ✅ `src/components/candidate/EventTimeline.tsx` - Legacy (kept for backward compat)
5. ✅ Update Candidate/Company detail pages to show timeline
   - ✅ CandidateDetailClient uses new EventTimeline

**Remaining Items**
- Add Timeline tab to Company detail page (future enhancement)

**Success Criteria**
- Every Kanban status change creates an event automatically ✅
- Timeline renders chronologically with icons ✅
- All events respect tenant isolation ✅
- Zero breaking changes to existing Candidate/Company tables ✅
