# Notes Events Debugger - Analysis

## Current Status

### Files Analyzed:
1. `src/lib/events/candidate-events.ts` - Backend event service
2. `src/components/candidate/CandidateDetailClient.tsx` - Candidate detail page
3. `src/components/EventTimeline.tsx` - Timeline component

## Issues Found

### 1. Backend (candidate-events.ts) - ✅ ALREADY FIXED
- `getCandidateEvents` correctly uses PK: `ENTITY#candidate#${candidateId}`
- `recordEvent` correctly sets PK: `ENTITY#candidate#${candidateId}`

### 2. CandidateDetailClient.tsx - ✅ ALREADY FIXED
- Uses timestamp cache-busting: `/api/candidate/${candidate.id}/events?limit=50&_t=${timestamp}`
- Has 300ms delay after saving note before refreshing
- Properly filters NOTE events

### 3. EventTimeline.tsx - ✅ FIXED
- Added timestamp cache-busting: `?_t=${timestamp}` in fetchEvents()
- Added 300ms delay after adding note before refetching

## Changes Applied
1. Added `const timestamp = new Date().getTime()` in fetchEvents
2. Changed fetch URL to include `&_t=${timestamp}` cache-busting parameter
3. Added `await new Promise(resolve => setTimeout(resolve, 300))` before refresh after adding note

## Status
All three key fixes are now in place:
- Backend uses correct PK format
- CandidateDetailClient has timestamp cache-busting
- EventTimeline has timestamp cache-busting + delay

## Next Steps
1. Commit and push changes
2. Verify deployment
3. Test adding notes and viewing in Timeline
