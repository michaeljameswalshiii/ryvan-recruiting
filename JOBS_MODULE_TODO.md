# Jobs Module Completion TODO

## Current State (as of analysis)

### Already Implemented ✅
- [x] Job schema: `src/lib/schemas/job.ts`
- [x] Job repository: `src/lib/db/repositories/job-repository.ts`
- [x] Jobs table configured: `turnkey-jobs` in dynamodb.ts
- [x] Navigation shows "Jobs": `src/components/dashboard/nav.tsx`
- [x] Jobs Kanban page: `src/app/dashboard/jobs/page.tsx`
- [x] Job API routes: `src/app/api/jobs/` (all routes)
- [x] Job hooks: `src/lib/hooks/query-job.ts` (all hooks)
- [x] Job events: `src/lib/events/job-events.ts`
- [x] Company Detail - Jobs tab (via useJobsForCompany)

### In Progress 🚧
- [ ] Job Detail page (`/dashboard/jobs/[id]/page.tsx`)
- [ ] Linked Jobs section in Candidate Detail

---

## Implementation Plan

### Phase 1: Job Detail Page (Priority: HIGH)
Create `src/app/dashboard/jobs/[id]/page.tsx`:
- [x] Display job details (title, company, location, salary, description)
- [x] Show Linked Candidates list with stages
- [x] Add "Link Candidate" functionality
- [x] Stage management UI (move candidates between stages)
- [x] Job status management
- [x] Events timeline for job

### Phase 2: Candidate Detail - Linked Jobs (Priority: HIGH)
Update `CandidateDetailClient.tsx`:
- [x] Fetch and display linked jobs using `useJobsForCandidate`
- [x] Show job title, company, stage for each linked job
- [x] Quick actions: view job, update stage

### Phase 3: Cleanup (Priority: LOW)
- [x] Update this TODO with completion status

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── jobs/
│   │       ├── route.ts          # POST/GET /api/jobs
│   │       └── [id]/
│   │           └── route.ts    # GET/PUT/DELETE /api/jobs/[id]
│   ├── dashboard/
│   │   ├── jobs/
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx  # Job detail page
│   │   │   └── page.tsx       # Jobs list (existing)
│   │   └── pipeline/
│   │       └── page.tsx       # Jobs Kanban (existing)
│   ├── candidates/
│   │   └── [id]/
│   │       └── page.tsx       # Add Linked Jobs section
│   └── companies/
│       └── [id]/
│           └── page.tsx      # Add Open Jobs section
├── lib/
│   ├── db/
│   │   └── repositories/
│   │       └── job-repository.ts  # Already exists ✅
│   └── schemas/
│       └── job.ts              # Already exists ✅
└── components/
    └── jobs/                   # New components folder
        ├── JobCard.tsx
        ├── JobForm.tsx
        └── LinkedJobs.tsx
