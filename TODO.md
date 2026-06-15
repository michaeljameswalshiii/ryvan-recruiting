# Fix candidate job linking error (`/api/data/leads/undefined/job/link`)

## Information Gathered
- Error indicates candidate ID becomes `undefined` when linking a job.
- In `CandidateDetailClient.tsx`, `LinkedJobsSection` currently calls:
  ```ts
  linkCandidate.mutateAsync({
    jobId: selectedJob.id,
    candidateData: { ... }
  })
  ```
- In `query-job.ts`, `useLinkCandidateToJobAppCentric` expects flat payload:
  - `candidateId`
  - `jobId`
  - `jobTitle`
  - optional `companyId`, `companyName`, `initialStage`
- Because payload shape is wrong, `candidateId` is undefined in hook, causing request URL:
  `/api/data/leads/undefined/job/link`
- Also found mismatch in note hook usage:
  - `useAddJobSpecificNote` expects `noteContent`
  - caller sends `content`

## Plan
1. Update `src/components/candidate/CandidateDetailClient.tsx`:
   - Fix `handleLinkJob` to call `useLinkCandidateToJobAppCentric` with correct flat payload.
   - Fix stage-note mutation call to use `noteContent` key.
2. Keep behavior unchanged otherwise (same dialogs/toasts/refetch flow).
3. Validate by checking TypeScript shape consistency and ensuring URL will use real `candidateId`.

## Dependent Files to be edited
- `src/components/candidate/CandidateDetailClient.tsx`

## Follow-up Steps
- Optionally run typecheck/build to catch any remaining payload mismatches.
- Re-test linking a job from candidate detail page and confirm no `undefined` in URL.
