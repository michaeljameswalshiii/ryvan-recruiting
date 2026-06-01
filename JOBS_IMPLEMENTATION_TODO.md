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

## Phase 6: Infrastructure (DONE)
- [x] Create turnkey-jobs DynamoDB table (via AWS CLI - status ACTIVE)
- [x] Add jobs table to CDK (cdk/stacks/dynamodb.py - already present)
- [x] Create migration script (scripts/migrate-leads-to-jobs.ts)

## Phase 7: Documentation
- [ ] Update Project_Goals.md - Update priorities
- [ ] Update EVENTS_ARCHITECTURE.md - Add Job events

---

## Implementation Status

### Completed:
- [x] Phase 1-5: Database, API, UI, Navigation, Detail Integration
- [x] Phase 6: Infrastructure (turnkey-jobs table created)

### In Progress:
- [ ] Phase 7: Documentation
