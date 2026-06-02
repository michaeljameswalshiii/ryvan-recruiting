# TODO - Implement Linked Jobs for Candidates

## Tasks:
1. [x] Understand Architecture
   - Backend: job-repository.ts has getJobsForCandidate, linkCandidateToJob, updateCandidateStage
   - Server Action: job-actions.ts has linkCandidateToJobAction, updateCandidateStageAction
   - Hooks: query-job.ts has useJobsForCandidate, useLinkCandidateToJob, useUpdateCandidateStageInJob
   - Frontend: CandidateDetailClient.tsx needs new Linked Jobs tab

2. [ ] Create Linked Jobs Tab in CandidateDetailClient.tsx
   - Add "Linked Jobs" to tab list
   - Create new LinkedJobsTab component
   - Display jobs with stage badges

3. [ ] Create LinkJobModal component
   - Searchable dropdown of available Open Jobs
   - Stage selector
   - Save handler with event recording

4. [ ] Implement Drag-and-Drop Stage Changes
   - Make rows draggable
   - Stage columns: Applied → Screening → Interviewing → Offered → Placed → Rejected
   - On drop → update stage via updateCandidateStageAction
   - Optimistic updates + refresh

5. [ ] Backend Events
   - Record CANDIDATE_LINKED_TO_JOB events
   - Record CANDIDATE_STAGE_CHANGED events

6. [ ] Polish & Test
   - Empty state
   - Loading/error states
   - Click job → go to job detail

## Plan:
- Use useJobs from query-job.ts to get all available jobs
- Filter jobs where this candidate is linked (using .linkedCandidates)
- Use HTML5 drag-and-drop for stage changes
- Use existing event recording system
