# Fix Issues TODO

## Issues Fixed:

### 1. Companies Refresh Button ✓
- **Status**: Already exists in `/dashboard/companies/page.tsx`
- **Action**: None needed - button was already present

### 2. Edit Companies ✓
- **Status**: EDIT button already exists in company detail page
- **Action**: No fix needed - the Edit button was already there

### 3. Candidates Links Wrong Path ✓
- **Issue**: Candidates page used `/candidates/${id}` but should use `/dashboard/candidates/${id}`
- **Fixed**: Updated links to use `/dashboard/candidates/${id}`

### 4. Add Candidate Button Not Working ✓
- **Issue**: No "new candidate" page existed at `/candidates/new`
- **Created**:
  - API route: `/api/candidate` (POST)
  - New page: `/dashboard/candidates/new`

## Implementation Steps Completed:

1. [x] Add Edit button to company detail page - Already exists
2. [x] Fix candidates list view links - Changed `/candidates/` to `/dashboard/candidates/`
3. [x] Fix candidates pipeline view links - Already correct
4. [x] Add Candidate button: Fixed link from `/candidates/new` to `/dashboard/candidates/new`
5. [x] Create API route for creating candidates
6. [x] Create new candidate page
7. [ ] Commit and push to GitHub
8. [ ] Deploy
