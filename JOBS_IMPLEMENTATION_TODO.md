# Jobs Module Implementation TODO

## Phase 1: Database Layer
- [x] Create `src/lib/schemas/job.ts` - Job schema with company link + candidate array
- [x] Create `src/lib/db/repositories/job-repository.ts` - CRUD + linking functions
- [x] Update `src/lib/db/dynamodb.ts` - Add jobsTable export

## Phase 2: API Routes
- [x] Create `/api/data/jobs/route.ts` - GET all, POST create
- [x] Create `/api/data/jobs/[id]/route.ts` - GET, PUT, DELETE by ID
- [x] Create `/api/data/jobs/[id]/link-candidate` - Link candidate to job
- [x] Create `/api/data/jobs/[id]/unlink-candidate` - Unlink candidate from job

## Phase 3: UI - Jobs Page
- [x] Create `src/lib/hooks/query-job.ts` - TanStack Query hooks
- [x] Create `src/app/dashboard/jobs/page.tsx` - Jobs Kanban board

## Phase 4: Navigation
- [x] Update `src/components/dashboard/nav.tsx` - Add "Jobs" menu, rename Pipeline → "Jobs Pipeline"

## Phase 5: Detail View Integration
- [x] Update Candidate Detail (`src/app/candidates/[id]/page.tsx`) - Add "Linked Jobs" section
- [x] Update Company Detail (`src/app/dashboard/companies/[id]/page.tsx`) - Add "Open Jobs" section

## Phase 6: Documentation
- [ ] Update Project_Goals.md - Update priorities
- [ ] Update EVENTS_ARCHITECTURE.md - Add Job events

## Phase 7: Migration (Optional)
- [ ] Create migration script if needed

---

## Implementation Status

### Completed:
- [x] Phase 1-5: Database, API, UI, Navigation, Detail Integration

### In Progress:
- [ ] Phase 6: Documentation

### Pending:
- [ ] Phase 7: Migration (Optional)
