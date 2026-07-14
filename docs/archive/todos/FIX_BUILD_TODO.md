# Build Fix Plan

## Issues Identified

### 1. Conflicting Star Exports in Events Index
**File**: `src/lib/events/index.ts`
**Problem**: Both `candidate-events.ts` and `company-events.ts` export functions with identical names:
- `recordCallCompleted`
- `recordTaskCompleted`  
- `recordTaskCreated`

When using `export * from './module'`, these conflict because they export the same names.

**Fix**: Change from `export *` to explicit named exports for each function.

### 2. Missing CandidateDetailClient Export
**File**: `src/components/candidate/index.ts`
**Problem**: The import in `[id]/page.tsx` uses:
```ts
import { CandidateDetailClient } from "@/components/candidate/CandidateDetailClient";
```
But the component is exported as a **default** export, not a named export.

**Fix**: Change import to default import:
```ts
import CandidateDetailClient from "@/components/candidate/CandidateDetailClient";
```

### 3. Conflicting Star Exports in Repositories Index
**File**: `src/lib/db/repositories/index.ts`
**Problem**: Multiple modules export functions with same names:
- `client-repository.ts` and `contact-repository.ts` both export `getPrimaryContact`, `setPrimaryContact`
- `job-repository.ts` and `lead-repository.ts` both export `updateCandidateStageInJob`

**Fix**: Change from `export *` to explicit named exports.

### 4. Dynamic Server Usage Error
**File**: Multiple dashboard pages
**Problem**: Routes using `cookies()` cannot be statically generated, but Next.js tries to pre-render them during build.

**Fix**: Add `export const dynamic = 'force-dynamic'` to pages that use session/cookies.

### 5. AWS Credentials Missing  
**Problem**: Region and credentials not set during build.

**Fix**: Add default region to AWS config or make pages that need AWS skip during build.

## Implementation Steps

1. Fix `src/lib/events/index.ts` - Explicit exports
2. Fix `src/app/dashboard/candidates/[id]/page.tsx` - Default import
3. Fix `src/lib/db/repositories/index.ts` - Explicit exports  
4. Add dynamic export to pages using cookies
