# Implementation TODO - TurnkeyOptimization Refactoring

## Phase 1: Security & Auth (Highest Priority)

### 1.1 Fix src/app/dashboard/layout.tsx
- [x] Uses server-auth.ts (server-side only) - DEFENSE-IN-DEPTH ✓
- [x] No import from aws.ts (uses server-auth.ts) ✓

### 1.2 Deprecate src/lib/aws.ts
- [x] Has server-only comment/warning ✓
- [x] Production blocker throws error in prod ✓
- [x] Kept for backward compat during transition ✓

### 1.3 Deprecate src/lib/auth.ts  
- [x] Marked as deprecated with warnings ✓
- [x] Uses localStorage (legacy - to be removed) ✓

## Phase 2: Data Layer - COMPLETED

### 2.1 Create Repositories - COMPLETED
- [x] tenant-repository.ts - FULL CODE with Zod, caching, verifyUserTenant ✓
- [x] profile-repository.ts - FULL CODE with Zod, caching, getProfileByEmail ✓
- [x] Pipeline, Client, Lead repositories - Already existed ✓

### 2.2 Create Barrel Exports - COMPLETED
- [x] repositories/index.ts - Updated with all 5 repositories ✓
- [x] db/index.ts - Updated ✓

### 2.3 Create Schemas - COMPLETED
- [x] tenant.ts schema - Already existed
- [x] profile.ts schema - Already existed

### 2.4 Create API Routes - COMPLETED
- [x] /api/data/leads/route.ts ✓
- [x] /api/data/leads/[id]/route.ts ✓  
- [x] /api/data/pipeline/route.ts ✓
- [x] /api/data/pipeline/[id]/route.ts ✓
- [x] /api/data/clients/[id]/route.ts ✓

### 2.5 Add Tenant Validation - COMPLETED
- [x] All routes use getSessionTenantId() from server-auth.ts ✓

## Phase 3: AI Improvements - COMPLETED

### 3.1 Refactor Bedrock Route - COMPLETED
- [x] Uses extracted SYSTEM_PROMPTS from bedrock-system.ts ✓
- [x] Import fix: Added SYSTEM_PROMPTS to imports ✓

### 3.2 Bug Fixes - COMPLETED
- [x] Fixed type errors in lead-repository.ts (updateItem<Lead>) ✓
- [x] Fixed type errors in pipeline-repository.ts (updateItem<Pipeline>) ✓

## Phase 3: AI Layer Refactoring - IN PROGRESS

### 3.1 Tool Registry - COMPLETED
- [x] Created src/lib/ai/tools/index.ts ✓
- [x] ToolDefinitions with execute() pattern ✓
- [x] ApolloSearchTool implementation ✓
- [x] TavilySearchTool implementation ✓
- [x] InternalDataTool (tenant-isolated) ✓
- [x] Tool selection via keywords ✓
- [x] formatToolResultsForAI() helper ✓

### 3.2 Bedrock Integration
- [x] Tool registry created at src/lib/ai/tools/index.ts ✓
- [x] bedrock/route.ts annotated with TODO for integration ✓
- [ ] Full integration (new tool registry not yet wired)

### 3.3 System Prompts
- [ ] Modular prompts in src/lib/prompts/

## READY FOR PUSH (Phase 2 Complete)
Phase 2 Data Layer complete. Phase 3 in progress.

## Testing Checklist
- [ ] Login flow works with cookies
- [ ] Middleware blocks unauthenticated access
- [ ] Tenant isolation works
- [ ] Dashboard pages load data correctly
- [ ] No AWS SDK in client bundle
