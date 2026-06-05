# Fix Issues TODO

## Issues to Fix:

### 1. Companies Refresh Button
- **Status**: Already exists in `/dashboard/companies/page.tsx`
- **Action**: None needed - button is already present

### 2. Cannot Edit Companies
- **Issue**: Company detail page at `/dashboard/companies/[id]/page.tsx` has no Edit button
- **Action**: Add Edit button to company detail page header

### 3. Candidates Links Wrong Path
- **Issue**: Candidates page uses `/candidates/${id}` but should use `/dashboard/candidates/${id}`
- **Current**: `/dashboard/candidates/page.tsx` links to `/candidates/${candidate.id}`
- **Should be**: `/dashboard/candidates/${candidate.id}` (links to proper detail page)
- **Action**: Fix links in list view and pipeline view

## Implementation Steps:

1. [ ] Add Edit button to company detail page
2. [ ] Fix candidates list view links (change `/candidates/` to `/dashboard/candidates/`)
3. [ ] Fix candidates pipeline view links (change `/candidates/` to `/dashboard/candidates/`)
4. [ ] Commit and push to GitHub
5. [ ] Deploy
