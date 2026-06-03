# TODO - Resume Upload Feature

## Summary
Add resume upload functionality to allow candidates to upload resumes (PDF/DOCX) which are stored in S3 and linked to their candidate record.

## Tasks

### 1. Create S3 Utility
- [ ] Create `/src/lib/aws/s3.ts` with S3 client configuration
- [ ] Add upload function with unique file naming (tenant/candidates/{uuid}/{filename})
- [ ] Set up environment variable validation

### 2. Create Upload Resume API
- [ ] Create `/src/app/api/upload-resume/route.ts`
- [ ] Accept file upload via FormData
- [ ] Validate file type (PDF, DOCX only)
- [ ] Integrate with S3 utility
- [ ] Return S3 URL on success

### 3. Update CandidateDetailClient.tsx
- [ ] Add file input for resume upload in Resume tab
- [ ] Handle file selection and upload
- [ ] Update candidate record with new resume URL
- [ ] Show upload progress/feedback

### 4. Environment Variables
- [ ] Add AWS_S3_BUCKET_NAME to environment
- [ ] Add AWS_REGION to environment

## Implementation Status

- [ ] Task 1: Create S3 utility
- [ ] Task 2: Create upload-resume API endpoint  
- [ ] Task 3: Update CandidateDetailClient.tsx
- [ ] Task 4: Configure environment variables
