# Implementation TODO - TurnkeyOptimization Refactoring

## Phase 1: Security & Auth (Highest Priority)

### 1.1 Fix src/app/dashboard/layout.tsx
- [ ] Remove client-side auth check (middleware handles it)
- [ ] Remove import from aws.ts

### 1.2 Deprecate src/lib/aws.ts
- [ ] Add server-only comment/warning
- [ ] Keep for backward compat during transition

### 1.3 Deprecate src/lib/auth.ts  
- [ ] Mark as deprecated
- [ ] Remove localStorage usage

## Phase 2: Data Layer

### 2.1 Create Pipeline Repository
- [ ] Create src/lib/db/repositories/pipeline-repository.ts

### 2.2 Create API Routes
- [ ] Create /api/data/leads/route.ts
- [ ] Create /api/data/leads/[id]/route.ts  
- [ ] Create /api/data/pipeline/route.ts
- [ ] Create /api/data/pipeline/[id]/route.ts

### 2.3 Add Tenant Validation
- [ ] Ensure all routes validate tenantId from session

## Phase 3: AI Improvements

### 3.1 Refactor Bedrock Route
- [ ] Use extracted prompts from bedrock-system.ts
- [ ] Improve error handling

## Testing Checklist
- [ ] Login flow works with cookies
- [ ] Middleware blocks unauthenticated access
- [ ] Tenant isolation works
- [ ] Dashboard pages load data correctly
- [ ] No AWS SDK in client bundle
