# TODO: Support Multiple Jobs per Candidate

## Summary
Update the Candidate data model and UI to properly support multiple jobs per candidate with improved display.

## Tasks

### 1. Update Data Model (lib/schemas/lead.ts)
- [x] Change linkedJobs items to use `jobId`, `jobTitle`, `companyName`

### 2. Update Lead Repository (lib/db/repositories/lead-repository.ts)
- [x] Update `getAllLeadsWithLinkedJobs()` to return proper object structure

### 3. Update Candidates List Page (app/dashboard/candidates/page.tsx)
- [x] Show max 2 jobs with "+X more" badge
- [x] Use Badge component for styling
- [x] Make badges clickable

### 4. Update LinkJobModal (components/candidate/LinkJobModal.tsx)
- [x] Update to pass full job objects instead of just IDs

## Implementation Notes
- Keep backward compatibility with existing linkedJobIds
- The data is already stored as linkedJobIds array in DynamoDB
- Enrichment happens at query time with job data

## Status: Complete ✓
