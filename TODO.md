# Candidate Job Linking Consistency - TODO

- [x] Analyze task and read relevant files
- [x] Create approved minimal-diff plan
- [ ] Update `src/components/candidate/CandidateDetailClient.tsx`
  - [ ] Fix app-centric link payload shape
  - [ ] Fix unlink id/title mapping for linkedJobs shape
  - [ ] Normalize job title display fallback
  - [ ] Switch Linked Jobs tab to linkedJobs[] + app-centric mutations
- [ ] Update `src/lib/hooks/query-job.ts`
  - [ ] Strengthen candidate-scoped query invalidation for app-centric mutations
- [ ] Update `src/components/candidate/LinkJobModal.tsx`
  - [ ] Remove legacy `linkedJobIds` write and use linkedJobs[] only
  - [ ] Add candidate-scoped invalidation key
- [ ] Run type check/build
- [ ] Prepare exact code diffs summary
- [ ] Git workflow: branch, commit, push, PR to master
- [ ] Deploy to prod
