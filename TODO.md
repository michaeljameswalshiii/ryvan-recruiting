# TODO - Implement Multiple Notes for Candidates

## Tasks:
1. [x] Understand the current Architecture - Done
   - Backend: addNoteToCandidate in candidate-events.ts (exists)
   - API: /api/candidate/[id]/notes (exists)
   - Frontend: CandidateDetailClient.tsx (needs Notes section)
   - Timeline: EventTimeline.tsx (already shows NOTE events)

2. [ ] Add useJobsForCandidate to query-job.ts (fix existing import error)

3. [ ] Update CandidateDetailClient.tsx Overview tab with Notes section
   - Fetch existing notes (NOTE events)
   - Add "Add Note" textarea + button
   - Display notes list (newest first) with author + timestamp
   - Nice formatting

4. [ ] Update Notes Tab (if needed)
   - Should match the quality of the Overview notes section

5. [ ] Deploy and Test

## Plan:
- Use existing API endpoint /api/candidate/[id]/notes for adding notes
- Fetch events with eventType === 'NOTE' for displaying
- Use useAddNote and useCandidateEvents hooks from query-candidate.ts
