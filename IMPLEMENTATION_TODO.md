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
- [x] /api/data/clients/route.ts ✓
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

## Phase 3: AI Layer Refactoring - COMPLETED

### 3.1 Tool Registry - COMPLETED
- [x] Created src/lib/ai/tools/index.ts ✓
- [x] ToolDefinitions with execute() pattern ✓
- [x] ApolloSearchTool implementation ✓
- [x] TavilySearchTool implementation ✓
- [x] InternalDataTool (tenant-isolated) ✓
- [x] Tool selection via keywords ✓
- [x] formatToolResultsForAI() helper ✓

### 3.2 Bedrock Integration - COMPLETED
- [x] Tool registry created at src/lib/ai/tools/index.ts ✓
- [x] bedrock/route.ts uses executeTool() and chooseTools() ✓
- [x] Removed unused imports (TOOL_REGISTRY, formatToolResultsForAI) ✓
- [x] Full integration complete ✓

### 3.3 System Prompts - COMPLETED
- [x] Modular prompts in src/lib/prompts/bedrock-system.ts ✓

## ALL PHASES COMPLETE ✅
Phase 1 Security, Phase 2 Data Layer, and Phase 3 AI Refactoring all complete.

## Phase 4: TanStack Query Integration - COMPLETED

### 4.1 Server Actions
- [x] client-actions.ts - CRUD for clients ✓
- [x] lead-actions.ts - Already existed ✓
- [x] pipeline-actions.ts - Already existed ✓

### 4.2 TanStack Query Hooks
- [x] query-client.ts - useClients, useCreateClient, etc + toasts ✓
- [x] query-lead.ts - useLeads, useCreateLead, etc + toasts ✓
- [x] query-pipeline.ts - usePipeline, useCreatePipeline, etc + toasts ✓
- [x] query-dashboard.ts - useDashboardStats, useRecentActivity ✓
- [x] hooks/index.ts - Barrel export ✓

### 4.3 UI Loading States
- [x] skeleton.tsx - CardSkeleton, TableRowSkeleton, DataTableSkeleton ✓

### 4.4 Dashboard Integration
- [x] dashboard/page.tsx - Updated to use TanStack Query ✓
- [x] Loading skeletons ✓
- [x] Real data from DynamoDB ✓

## Phase 5: Error Handling & Notifications - COMPLETED

### 5.1 Error Boundary
- [x] error-boundary.tsx - ErrorBoundary with retry + OperationError + HelpTip ✓

### 5.2 Centralized Error Handler
- [x] error-handler.ts - Error types, user-friendly messages, logError ✓

### 5.3 Toast Notifications
- [x] All mutations now show success/error toasts via sonner ✓
- [x] query-lead.ts - Toast notifications on create/update/delete ✓
- [x] query-client.ts - Toast notifications on create/update/delete ✓
- [x] query-pipeline.ts - Toast notifications on create/update/delete ✓

## Testing / Deployment
- [ ] Run npm run dev to test locally
- [ ] Deploy to Vercel for production testing
- [ ] Verify login → dashboard → logout flow works
- [ ] Test AI assistant with candidate searches
