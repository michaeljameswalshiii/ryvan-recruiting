# Turnkey Optimization - Next Batch Plan

## Information Gathered

### Task Context
The user wants us to focus on "next high-priority batch" with two main tasks:
1. **Task 1: Resume Upload & Parsing** (Highest Priority)
2. **Task 2: Polish Candidate Overview Tab**

### Current Implementation Analysis

#### Task 1: Resume Upload & Parsing

**Current State:**
- API Route exists: `/api/parse-resume/route.ts`
- Uses pdfjs + mammoth for text extraction
- Uses Bedrock (MiniMax M2) for AI parsing
- In candidates page (`/dashboard/candidates/page.tsx`):
  - File input for PDF upload
  - Calls `/api/parse-resume` on file change
  - Auto-populates form fields with parsed data

**Current Limitations:**
- Only PDF supported (need Word (.docx) support)
- No Google Docs import
- Original file stored as resume_url but needs S3 storage
- No inline resume viewer in Overview tab

#### Task 2: Candidate Overview Tab

**Current State:**
- Component: `CandidateDetailClient.tsx`
- Shows tabs: Overview, Timeline, Resume, Notes, Emails, Details
- Overview tab shows contact info (read-only)
- Has Resume tab with ResumeViewer component
- Email button (mailto link) exists

**Current Limitations:**
- Phone, Email, Location NOT editable inline
- Email button doesn't record event in Timeline
- No Linked Jobs section
- No company name dropdown for multiple contacts
- Important Notes section is basic
- Resume viewer not in Overview (needs switching to Resume tab)

### Files to Modify

1. **CandidateDetailClient.tsx** - Main UI for Overview polish
2. **ResumeViewer.tsx** - Inline resume in Overview
3. **/api/parse-resume/route.ts** - Add Word support, improve parsing
4. **lead-repository.ts** - Add resume_url S3 storage support
5. **candidates/page.tsx** - Ensure resume upload works
6. **candidate-events.ts** - Add email sent event recording

---

## Plan

### Task 1: Resume Upload & Parsing (Highest Priority)

#### Step 1.1: Extend parse-resume API
- Add .docx support using mammoth (already imported)
- Keep existing pdfjs for PDF
- Improve regex extraction for fallback
- Add proper error handling

#### Step 1.2: Add S3 storage for resumes
- Create/upload function for S3
- Store original file in S3
- Save S3 URL in candidate resume_url field

#### Step 1.3: Update lead schema
- Ensure resume_url field is properly handled
- Add type support for S3 URLs

### Task 2: Polish Candidate Overview Tab

#### Step 2.1: Make fields directly editable
- Phone, Email, Location in Overview
- Use inline edit pattern or modal
- Add API update calls

#### Step 2.2: Improve Email button
- Use SendEmailModal instead of mailto
- Record EMAIL_SENT event in Timeline

#### Step 2.3: Add Linked Jobs section
- Query jobs linked to candidate
- Show in Overview tab

#### Step 2.4: Company dropdown
- Show multiple contacts per company
- Dropdown selection

#### Step 2.5: Important Notes section
- Make it rich text area
- Show recent notes inline

#### Step 2.6: Resume viewer in Overview
- Add inline resume preview in Overview tab
- Download button

---

## Dependent Files to Edit

1. `turnkey-optimization/src/components/candidate/CandidateDetailClient.tsx`
2. `turnkey-optimization/src/components/candidate/ResumeViewer.tsx`
3. `turnkey-optimization/src/app/api/parse-resume/route.ts`
4. `turnkey-optimization/src/lib/db/repositories/lead-repository.ts`
5. `turnkey-optimization/src/app/dashboard/candidates/page.tsx`
6. `turnkey-optimization/src/components/email/send-email-modal.tsx`
7. `turnkey-optimization/src/lib/schemas/lead.ts`
8. `turnkey-optimization/Project_Goals.md`
9. `turnkey-optimization/TODO.md`

---

## Followup Steps

1. Test resume upload with PDF and Word
2. Test AI parsing accuracy
3. Verify S3 storage (requires AWS config)
4. Test inline editing of fields
5. Test email event recording
6. Test Linked Jobs display
7. Verify all tenant isolation

---

## Implementation Order

1. First: Resume parsing improvements
2. Second: Overview tab polish
3. Update TODO.md and Project_Goals.md on completion
