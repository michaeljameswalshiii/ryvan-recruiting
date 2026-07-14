# Companies Pipeline Implementation TODO

## Task: Mirror Candidates Flow/Stages/Architecture to Companies

This document tracks the implementation to add pipeline stages and drag-and-drop to the Companies section, matching the existing Candidates architecture.

## Current State Analysis

### Candidates (Model to Follow)
- **Schema**: `src/lib/schemas/lead.ts` - has `status` field with 7-stage enum
- **Repository**: `src/lib/db/repositories/lead-repository.ts` - full CRUD + status functions
- **Hooks**: `src/lib/hooks/query-lead.ts` - useLeads, useUpdateLeadStatus
- **UI Page**: `src/app/dashboard/candidates/page.tsx` - 7-column Kanban with drag-drop (@dnd-kit)
- **Detail Page**: Tabs for Overview, History, Notes

### Companies (Current)
- **Schema**: `src/lib/schemas/client.ts` - Added `status` field with enum
- **Repository**: `src/lib/db/repositories/client-repository.ts` - Added status functions
- **Hooks**: `src/lib/hooks/query-client.ts` - Added useUpdateClientStatus
- **UI Page**: `src/app/dashboard/companies/page.tsx` - needs Kanban conversion
- **Detail Page**: Tabs for Overview, History, Jobs, Contacts, Notes

## Implementation Plan

### Phase 1: Schema Updates ✅ DONE
- [x] Add `status` field to `src/lib/schemas/client.ts`
- [x] Status enum: identification, outreach, conversation, presented, interview, accept, rejected
- [x] Status default set to 'identification'
- [x] Add ClientStatus type export

### Phase 2: Repository Updates ✅ DONE
- [x] `getClientsByStatus` function in client-repository.ts
- [x] `updateClientStatus` function
- [x] `createClient` defaults status to "identification"
- [x] Add status to updateClient function

### Phase 3: Server Actions Updates ✅ DONE
- [x] Import updateClientStatus from repository
- [x] Add status to createClient rawData
- [x] Add `updateClientStatusAction` server action

### Phase 4: Hooks Updates ✅ DONE
- [x] Import updateClientStatusAction
- [x] Add `useUpdateClientStatus` hook with optimistic updates

### Phase 5: UI - Companies Page ✅ DONE
- [x] Convert from grid to 7-column Kanban
- [x] Add drag-and-drop using @dnd-kit
- [x] Use same pipelineStages config as candidates
- [x] Add status field when creating new company (defaults to "identification")
- [x] Update add dialog description

### Phase 6: UI - Detail Page ✅ DONE
- [x] Update detail page to display status badge in header
- [x] Show status with proper label formatting

## Pipeline Stages (Same as Candidates)
```typescript
const pipelineStages = [
  { id: "identification", label: "Identification", color: "bg-blue-500" },
  { id: "outreach", label: "Attempted Outreach", color: "bg-yellow-500" },
  { id: "conversation", label: "Conversation", color: "bg-purple-500" },
  { id: "presented", label: "Candidate Presented", color: "bg-indigo-500" },
  { id: "interview", label: "Interview", color: "bg-orange-500" },
  { id: "accept", label: "Accept", color: "bg-green-500" },
  { id: "rejected", label: "Rejected", color: "bg-red-500" },
];
```

## Files Modified
1. `src/lib/schemas/client.ts` - Added status enum and field
2. `src/lib/db/repositories/client-repository.ts` - Added status functions
3. `src/lib/actions/client-actions.ts` - Added updateClientStatusAction
4. `src/lib/hooks/query-client.ts` - Added useUpdateClientStatus

## Testing
- [x] Verify new companies get default 'identification' status
- [x] Test drag-drop between stages
- [x] Verify status persists after page refresh
