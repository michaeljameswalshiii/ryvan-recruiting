# Parse Resume Enhancement TODO

## Steps to Complete

### 1. Enhanced parse-resume Route Implementation
- [x] Update system prompt with explicit garbage rejection rules
- [x] Add pre-extracted hints template for user prompt
- [x] More aggressive text cleaning (page headers, mediaimage noise)
- [x] Switch to Bedrock with temperature 0.0
- [ ] Test with noisy resumes

### 2. Implementation Details
- [x] Read current parse-resume route
- [x] Review Bedrock integration options
- [x] Build successful - no compilation errors

### 3. Testing
- [ ] Test with clean resume PDF
- [ ] Test with noisy resume (mediaimage artifacts)
- [ ] Test with page headers
- [ ] Verify JSON output accuracy
