# TODO: Major ATS Refactor - Application-Centric Model

## Summary
Implement an Application-centric model where stages and notes are tied to Candidate + Job combinations (not just the candidate).

## Status: IN PROGRESS

### Completed Parts

#### ✅ Part 1: Define New APPLICATION_STAGES Constant
- **Status**: COMPLETE ✓
- **Location**: `src/lib/schemas/lead.ts`
- **Implementation**:
  - `APPLICATION_STAGES` array with 15 stages (sourced, left_message, text, email, other, contacted, pre_screened, submitted, interviewing, offer_out, offer_accepted, offer_declined, placed, rejected, not_interested)
  - Each stage has value, label, and color
  - Helper functions: `getStageLabel()`, `getStageColor()`, `isValidApplicationStage()`
  - Legacy mapping: `mapLegacyStageToApplicationStage()`

#### ✅ Part 2: Backend Data Model + API Routes
- **Status**: COMPLETE ✓
- **Locations**:
  - `src/lib/schemas/lead.ts` - Extended Schema with linkedJobSchema, JobNote
  - `src/lib/db/repositories/lead-repository.ts` - New functions:
    - `updateCandidateStageInJob()` - Update stage for Candidate + Job
    - `addJobSpecificNote()` - Add job-specific note
    - `linkCandidateToJobForApplication()` - Link with stage tracking
    - `unlinkCandidateFromJobForApplication()` - Unlink candidate
    - `getJobSpecificNotes()` - Get notes for job
    - `getLinkedJobsForCandidate()` - Get all jobs with stage info
    - `isCandidateLinkedToJob()` - Check link status
  - `src/lib/db/repositories/index.ts` - Exports updated

- **API Routes**:
  - `src/app/api/data/leads/[id]/job/[jobId]/stage/route.ts` - PUT endpoint
  - `src/app/api/data/leads/[id]/job/[jobId]/note/route.ts` - POST endpoint
  - `src/app/api/data/leads/[id]/job/link/route.ts` - POST endpoint
  - `src/app/api/data/leads/[id]/job/[jobId]/unlink/route.ts` - POST endpoint

#### ✅ Part 3: Batched Migration Script
- **Status**: COMPLETE ✓
- **Location**: `src/app/api/migrate-candidates/application-centric/route.ts`
- **Implementation**:
  - Safe batched processing (50-100 per batch)
  - Checkpointing for resumability
  - Preserves existing data
  - Maps legacy stages to new APPLICATION_STAGES
  - GET endpoint for preview
  - POST endpoint for migration

#### ✅ Part 4: Frontend Components
- **Status**: MOSTLY COMPLETE ✓
- **Locations**:
  - Candidates List: `src/app/dashboard/candidates/page.tsx` - Updated to use APPLICATION_STAGES
  - Candidates Detail: `src/components/candidate/CandidateDetailClient.tsx` - Uses getStageLabel/getStageColor
  - Job Detail page: `src/app/dashboard/jobs/[id]/page.tsx` - Updated to use APPLICATION_STAGES
  - Linked Jobs Section: Uses new stage dropdowns

#### ✅ Part 5: Auto-Prompt on Stage Change
- **Status**: COMPLETE ✓
- **Location**: `src/components/candidate/StageChangeNoteModal.tsx`
- **Implementation**:
  - Modal shown when stage changes
  - Shows new stage value
  - User can add note or skip
  - Note saved as job-specific note with relatedStage

### What's Been Updated

1. **Schema** (`src/lib/schemas/lead.ts`):
   - APPLICATION_STAGES constant (15 stages)
   - linkedJobSchema with stage, stageUpdatedAt, stageUpdatedBy, notes[]
   - jobNoteSchema
   - getStageLabel(), getStageColor(), isValidApplicationStage()

2. **Lead Repository** (`src/lib/db/repositories/lead-repository.ts`):
   - mapLegacyStageToApplicationStage()
   - isValidApplicationStage()
   - updateCandidateStageInJob()
   - addJobSpecificNote()
   - linkCandidateToJobForApplication()
   - unlinkCandidateFromJobForApplication()
   - getJobSpecificNotes()
   - getLinkedJobsForCandidate()

3. **Migration API** (`src/app/api/migrate-candidates/application-centric/route.ts`):
   - Batched migration with checkpointing
   - Preview endpoint (GET)
   - Migration endpoint (POST)

4. **Candidates List Page** (`src/app/dashboard/candidates/page.tsx`):
   - Uses APPLICATION_STAGES for display
   - Shows job-specific stages in table
   - Pipeline view with stages

5. **Job Detail Page** (`src/app/dashboard/jobs/[id]/page.tsx`):
   - Uses APPLICATION_STAGES dropdown
   - Stage management per candidate

6. **StageChangeNoteModal** (`src/components/candidate/StageChangeNoteModal.tsx`):
   - Auto-prompt on stage change
   - Note saving with relatedStage

### Testing Instructions

1. **Preview Migration**:
   ```
   GET /api/migrate-candidates/application-centric
   ```

2. **Run Migration**:
   ```
   POST /api/migrate-candidates/application-centric
   ```

3. **Run Batched Migration**:
   ```
   POST /api/migrate-candidates/application-centric?batchSize=50
   ```

4. **Verify UI**:
   - Visit Candidates List - should show new stages
   - Visit Candidate Detail - should show Linked Jobs with stages
   - Visit Job Detail - should show stage dropdowns with new stages

### Next Steps (If Needed)

- [ ] Run the migration to populate linkedJobs data
- [ ] Test stage changes trigger the modal
- [ ] Add job-specific notes to Candidate Detail UI
- [ ] Update Pipeline/Kanban view to use new stages

## Implementation Notes

- Backward compatibility maintained via linkedJobIds
- Legacy stages map to new APPLICATION_STAGES
- Migration preserves all existing data
- Batched processing prevents timeouts
