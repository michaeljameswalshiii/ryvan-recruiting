# Resume Fix Implementation Plan

## Goals
- Permanent S3 storage with stable fileKey
- 7-day presigned URLs (604800 seconds)
- Auto-refresh on URL failure
- Enhanced parsing with section detection

## Files to Update

### 1. src/app/api/parse-resume/route.ts
- [x] Accept file upload
- [x] Enhanced parsing (name, title, email, phone, experience, education, skills)
- [ ] Upload permanently to S3
- [ ] Generate presigned URL with 7-day expiry
- [ ] Return: { success, resumeUrl, fileKey, parsedData }
- [ ] Bedrock fallback

### 2. src/app/api/resume-url/route.ts
- [ ] Support GET method with query param
- [ ] 7-day expiry (604800 seconds)

### 3. src/components/candidate/ResumeViewer.tsx
- [ ] Auto-refresh on mount when URL fails
- [ ] Accept fileKey + candidateId props
- [ ] Add loading + error retry

### 4. src/components/candidate/CandidateDetailClient.tsx
- [ ] Resume tab: pass fileKey to ResumeViewer

### 5. Data APIs
- [ ] Add resume_file_key field support

## Implementation Order
1. parse-resume/route.ts (most important)
2. resume-url/route.ts
3. ResumeViewer.tsx
4. CandidateDetailClient.tsx
