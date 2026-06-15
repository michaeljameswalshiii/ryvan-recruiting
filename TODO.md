# Plan: Replace Linked Jobs Section in CandidateDetailClient.tsx

## Information Gathered
- File: `src/components/candidate/CandidateDetailClient.tsx`
- Current Linked Jobs is in Overview tab via `<LinkedJobsSection />` component (a separate function at bottom of file)
- The Overview tab contains the Linked Jobs section inline after Contact Information
- The file already has:
  - Imports for Briefcase, Plus, Trash2 icons
  - `queryClient` from useQueryClient
  - `handleUnlinkJob` and `handleStageChange` functions exist but need updates
  - `showLinkModal` state already exists
  - Need to import/link `LinkJobModal`

## Plan
1. **Import LinkJobModal** - Add import for LinkJobModal component
2. **Update handleUnlinkJob** - Update to match new specification with linkedJobIds sync
3. **Update handleStageChange** - Ensure it matches spec (with stageUpdatedAt, stageUpdatedBy)
4. **Replace Linked Jobs Section in Overview** - Replace the `<LinkedJobsSection>` component with new inline JSX
5. **Add LinkJobModal at bottom** - Ensure modal exists in the return statement
6. **Run build** - Test with `npm run build`

## Files to Edit
- `src/components/candidate/CandidateDetailClient.tsx` (single file)

## Follow-up Steps
1. Run `npm run build` to check for errors
2. Test the unlink functionality
