# Candidate Detail Page Implementation

## Steps:
- [ ] 1. Create new API route: src/app/api/candidate/[id]/route.ts
- [ ] 2. Create Tabs component for the page
- [ ] 3. Create the candidate detail page: src/app/candidates/[id]/page.tsx
- [ ] 4. Deploy the application

## Implementation Details:

### 1. API Route (src/app/api/candidate/[id]/route.ts)
- GET endpoint to fetch single candidate by ID
- Uses getLeadById from lead-repository

### 2. Tabs Component
- Create a simple Tabs component using existing UI primitives
- TabsList, TabsTrigger, TabsContent

### 3. Candidate Detail Page
- App Router page with dynamic [id] parameter
- Header with candidate info, photo, status badge
- Tab sections: Overview, Timeline (EventTimeline), Notes, Emails, Details
- Send Email button → SendEmailModal
- Back button to candidates list
- Loading skeleton & error states
