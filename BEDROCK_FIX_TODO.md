# Bedrock API Fix Implementation TODO

## Task: Make Vercel deployment more robust with excellent debugging

### Current Issues Identified:
1. Error handling returns generic "Bedrock failed" message instead of real error
2. No graceful fallback to Haiku if Sonnet fails
3. Missing early environment variable validation
4. Model IDs may not be correct for all regions
5. No diagnostic/health endpoint for debugging

### Implementation Steps:

## STEP 1: Update `/src/app/api/bedrock/route.ts`
- [x] 1.1 Add early env var validation with detailed logging
- [x] 1.2 Improve error handling to return actual error message
- [x] 1.3 Add graceful fallback from Sonnet to Haiku
- [x] 1.4 Add more detailed console logging (model, env vars presence, tenant, error details)
- [x] 1.5 Add timeout handling
- [x] 1.6 Add request validation

## STEP 2: Create Health/Diagnostic Endpoint  
- [x] 2.1 Create `/src/app/api/bedrock/health/route.ts` endpoint

## STEP 3: Additional Improvements
- [ ] 3.1 Add improved AWS credentials check
- [ ] 3.2 Add more specific error categorization

## Files to Update:
- `/src/app/api/bedrock/route.ts` - Main API route (FULL UPDATE)

## Files to Create:
- `/src/app/api/bedrock/health/route.ts` - Health check endpoint

## Verification Checklist:
- [ ] Deploy to Vercel
- [ ] Check Vercel function logs
- [ ] Test health endpoint
- [ ] Test fallback functionality
- [ ] Verify real error messages are displayed
