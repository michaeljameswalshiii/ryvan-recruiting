# TODO: AI Apollo "Add to Candidates" Implementation

## Status: COMPLETED (except integration)

The core function `importResultAsCandidate` already existed in `src/lib/candidates/import.ts`. The following fixes and features have been implemented:

## Completed Tasks ✅

### 1. Fix Missing Functions in lead-repository.ts ✅
- Added `getLeadByEmail(tenantId, email)` function
- Added `getLeadByLinkedIn(tenantId, linkedinUrl)` function
- Uses fallback scanning for duplicate detection

### 2. Fix Bug in import.ts ✅
- Fixed: `rawData.state` should be `rawResult.state`

### 3. Create API Route for Import ✅
- Created `/api/import-candidate/route.ts` 

### 4. Create UI Components ✅
- `src/components/candidate-import/save-button.tsx` - Save button for each result
- `src/components/candidate-import/result-card.tsx` - Result card display with import button
- `src/components/candidate-import/index.ts` - Exports

### 5. Example Usage ✅
- Documented in result-card.tsx comments

## Remaining Task: Integration

### Integrate into AI Apollo Search Page
- [ ] Update `/app/dashboard/ai-apollo/page.tsx` to show results with import buttons
- [ ] Add result cards with "Save as Candidate" button  
- [ ] Handle bulk select functionality

## Files Modified
- `src/lib/db/repositories/lead-repository.ts` - added duplicate check functions
- `src/lib/candidates/import.ts` - fixed bug  

## Files Created
- `src/app/api/import-candidate/route.ts` - new API endpoint
- `src/components/candidate-import/save-button.tsx` - button component
- `src/components/candidate-import/result-card.tsx` - card component  
- `src/components/candidate-import/index.ts` - exports

## Usage Example
```tsx
import { SaveCandidateButton, AIResultCard, AIResultsList } from '@/components/candidate-import';

// Single result button:
<SaveCandidateButton 
  result={result} 
  source="apollo" 
  searchQuery="Python developer"
  onSuccess={(id) => console.log('Created:', id)}
/>

// Results list with bulk:
<AIResultsList 
  results={apolloResults}
  source="apollo"
  searchQuery="Python developer"
  onSuccess={(id) => router.push(`/candidates/${id}`)}
/>
