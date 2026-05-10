# TurnkeyOptimization Refactoring Plan

## Overview
This plan addresses the critical security, architecture, and AI layer issues in the project.

---

## ✅ COMPLETED ITEMS

### Phase 1: Security & Authentication
- [x] Create server-only auth utility (`src/lib/server-auth.ts`) ✅
- [x] Create cache utility (`src/lib/cache.ts`) ✅
- [x] Fix middleware (`src/middleware.ts`) ✅
- [x] Create server-only DynamoDB client (`src/lib/db/dynamodb.ts`) ✅

### Phase 2: Data Layer
- [x] Create Zod schemas (`src/lib/schemas/*.ts`) ✅
- [x] Create client repository (`src/lib/db/repositories/client-repository.ts`) ✅
- [x] Create auth API routes (`src/app/api/auth/*.ts`) ✅
- [x] Create data API routes (`src/app/api/data/clients/route.ts`) ✅
- [x] Create client API wrapper (`src/lib/api/client-api.ts`) ✅
- [x] Create auth client API (`src/lib/api/auth-client.ts`) ✅

### Phase 3: AI Layer
- [x] Extract system prompt (`src/lib/prompts/bedrock-system.ts`) ✅

---

## Implementation Status

---

## Phase 1: Security & Authentication (HIGHEST PRIORITY)

### 1.1 Create Server-Only Auth Utility (`src/lib/server-auth.ts`)

**Purpose**: Replace localStorage auth with httpOnly cookies + server-side Cognito validation

**Implementation**:
```typescript
// NOTE: Server-side only - never import in client components
'use server'

// Functions needed:
- validateSession(request: Request) -> Session | null
- getSessionTenantId(request: Request) -> string | null  
- getSessionUserId(request: Request) -> string | null
- authenticateUser(email: string, password: string) -> Session
- registerUser(data: RegisterInput) -> Session
- signOutUser(request: Request) -> void
```

**Cookie Configuration**:
- Name: `turnkey-session`
- httpOnly: true
- secure: true (production only)
- sameSite: 'lax'
- path: /
- maxAge: 24 hours (86400 seconds)

### 1.2 Fix Middleware (`src/middleware.ts`)

**Current State**: Completely disabled, allows all routes

**Required Fix**:
```typescript
// matcher: All protected routes except static files, login, signup
const PROTECTED_ROUTES = ['/dashboard/:path*', '/api/protected/:path*']

// middleware logic:
1. Extract session cookie
2. Validate with server-auth utility
3. If invalid -> redirect to /login
4. If valid -> add tenant context to headers
5. Always add tenantId to request headers for DB queries
```

**Headers to inject**:
- `x-tenant-id`: Verified tenant ID from session
- `x-user-id`: User's cognito sub

### 1.3 Move ALL DynamoDB to Server-Only

**Current Problem**: `src/lib/aws.ts` is marked `"use client"` and exposes:
- getClients, createClient, updateClient, deleteClient
- getLeads, createLead, updateLead, deleteLead
- getPipeline, createPipeline, updatePipeline, deletePipeline
- All tenant data operations can be called from client

**Solution**: Create server-only API routes and Server Actions

#### 1.3.1 Create API Routes for Data Access

**New files**:
- `src/app/api/data/clients/route.ts` - GET, POST clients
- `src/app/api/data/clients/[id]/route.ts` - GET, PUT, DELETE single client
- `src/app/api/data/leads/route.ts` - GET, POST leads
- `src/app/api/data/leads/[id]/route.ts` - GET, PUT, DELETE single lead
- `src/app/api/data/pipeline/route.ts` - GET, POST pipeline
- `src/app/api/data/pipeline/[id]/route.ts` - GET, PUT, DELETE pipeline

**All routes must**:
1. Extract tenantId from request headers (not query params!)
2. Verify tenantId matches session
3. Return only data for that tenant

#### 1.3.2 Create Server Actions (Alternative to API routes)

**New files**:
- `src/lib/actions/client-actions.ts`
- `src/lib/actions/lead-actions.ts`
- `src/lib/actions/pipeline-actions.ts`

**Example**:
```typescript
'use server'

export async function createClient(data: CreateClientInput) {
  // 1. Validate session
  // 2. Get verified tenantId from session
  // 3. Force tenantId (never use client-provided)
  // 4. Validate input with Zod
  // 5. Save to DynamoDB
  // 6. Return result
}
```

### 1.4 Update Client Components

**Files to update**:
- `src/components/forms/login-form.tsx` - Use server action + redirect
- `src/components/forms/signup-form.tsx` - Use server action + redirect
- `src/app/dashboard/layout.tsx` - Remove client-side auth check
- `src/app/dashboard/companies/page.tsx` - Use API routes instead of aws.ts
- `src/app/dashboard/pipeline/page.tsx` - Use API routes instead of aws.ts

---

## Phase 2: Data Layer

### 2.1 Create Repository Pattern

**Directory**: `src/lib/db/repositories/`

**Files to create**:
- `src/lib/db/repositories/tenant-repository.ts`
- `src/lib/db/repositories/profile-repository.ts` 
- `src/lib/db/repositories/client-repository.ts`
- `src/lib/db/repositories/lead-repository.ts`
- `src/lib/db/repositories/pipeline-repository.ts`
- `src/lib/db/repositories/index.ts` - Export all

**Repository interface pattern**:
```typescript
interface ClientRepository {
  getById(tenantId: string, id: string): Promise<Client | null>
  getAll(tenantId: string): Promise<Client[]>
  create(tenantId: string, data: CreateClientInput): Promise<Client>
  update(tenantId: string, id: string, data: UpdateClientInput): Promise<Client>
  delete(tenantId: string, id: string): Promise<void>
}
```

### 2.2 Add Zod Schemas

**Directory**: `src/lib/schemas/`

**Files to create**:
- `src/lib/schemas/client.ts` - Client validation
- `src/lib/schemas/lead.ts` - Lead validation
- `src/lib/schemas/pipeline.ts` - Pipeline validation
- `src/lib/schemas/auth.ts` - Auth validation
- `src/lib/schemas/index.ts` - Export all

**Example schema**:
```typescript
export const ClientSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  domain: z.string().url().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  employee_count: z.number().optional(),
  revenue: z.string().optional(),
  description: z.string().optional(),
})

export type CreateClientInput = z.infer<typeof ClientSchema>
```

### 2.3 Add Caching Layer

**File**: `src/lib/cache.ts`

**Implementation options**:
1. Vercel KV (production)
2. In-memory cache (development/small scale)

```typescript
// Simple in-memory cache
const cache = new Map<string, { data: any, expires: number }>()

export async function getCached<T>(key: string): Promise<T | null>
export async function setCached<T>(key: string, data: T, ttlSeconds: number): Promise<void>
export async function invalidateCache(pattern: string): Promise<void>
```

---

## Phase 3: AI Layer Improvements

### 3.1 Refactor `/api/bedrock/route.ts`

**Current Issues**:
1. Keyword-based routing is brittle
2. Huge hardcoded system prompt
3. Mixed concerns
4. Poor error handling

**Solution**:

#### 3.1.1 Extract System Prompt to Separate File

**New file**: `src/lib/prompts/bedrock-system.ts`

```typescript
export function getSystemPrompt(context: {
  apolloAvailable: boolean;
  apolloError?: string;
  hasToolResults: boolean;
}): string {
  // Return properly formatted system prompt based on context
}
```

#### 3.1.2 Extract Tool Detection Logic

**New file**: `src/lib/tools/detector.ts`

```typescript
export function detectRequiredTools(userQuery: string): {
  needsApollo: boolean;
  needsSearch: boolean;
  needsWebSearch: boolean;
} {
  // Use ML-based or more sophisticated detection
}
```

#### 3.1.3 Create Tool Implementations

**Directory**: `src/lib/tools/`

- `src/lib/tools/apollo.ts` - Apollo API wrapper
- `src/lib/tools/tavily.ts` - Tavily search
- `src/lib/tools/index.ts` - Tool orchestration

#### 3.1.4 Add Structured Logging

```typescript
import { logger } from '@vercel/edge-config' // or similar

export async function POST(request: Request) {
  const startTime = Date.now()
  try {
    // ... existing logic
    logger.info('bedrock-request', {
      query: lastUserQuery.substring(0, 100),
      apolloUsed,
      duration: Date.now() - startTime
    })
  } catch (error) {
    logger.error('bedrock-error', {
      error: error.message,
      duration: Date.now() - startTime
    })
  }
}
```

---

## File Modification Summary

### Files to CREATE:
1. `src/lib/server-auth.ts` - Server-only auth
2. `src/lib/db/client.ts` - DynamoDB client (server-only)
3. `src/lib/db/repositories/tenant-repository.ts`
4. `src/lib/db/repositories/profile-repository.ts`
5. `src/lib/db/repositories/client-repository.ts`
6. `src/lib/db/repositories/lead-repository.ts`
7. `src/lib/db/repositories/pipeline-repository.ts`
8. `src/lib/schemas/client.ts`
9. `src/lib/schemas/lead.ts`
10. `src/lib/schemas/pipeline.ts`
11. `src/lib/schemas/auth.ts`
12. `src/lib/cache.ts`
13. `src/lib/prompts/bedrock-system.ts`
14. `src/lib/tools/detector.ts`
15. `src/lib/tools/apollo.ts`
16. `src/lib/tools/tavily.ts`
17. `src/lib/actions/client-actions.ts`
18. `src/lib/actions/lead-actions.ts`
19. `src/lib/actions/pipeline-actions.ts`
20. `src/app/api/data/clients/route.ts`
21. `src/app/api/data/clients/[id]/route.ts`
22. `src/app/api/data/leads/route.ts`
23. `src/app/api/data/leads/[id]/route.ts`
24. `src/app/api/data/pipeline/route.ts`
25. `src/app/api/data/pipeline/[id]/route.ts`

### Files to MODIFY:
1. `src/middleware.ts` - Re-enable auth protection
2. `src/components/forms/login-form.tsx` - Use server action
3. `src/components/forms/signup-form.tsx` - Use server action
4. `src/app/dashboard/layout.tsx` - Remove client auth check
5. `src/app/dashboard/companies/page.tsx` - Use API routes
6. `src/app/dashboard/pipeline/page.tsx` - Use API routes
7. `src/app/api/bedrock/route.ts` - Refactor with better architecture
8. `src/lib/auth.ts` - Mark as deprecated, keep minimal exports
9. `src/lib/aws.ts` - Mark as server-only, remove "use client"

### Files to DEPRECATE (mark clearly):
1. `src/lib/aws.ts` - Migrate to repositories
2. `src/lib/auth.ts` - Migrate to server-auth.ts

---

## Implementation Order

### Step 1: Server Auth Foundation
1. Create `src/lib/server-auth.ts`
2. Create `src/lib/cache.ts`
3. Update `src/middleware.ts`

### Step 2: DB Layer
1. Create `src/lib/db/client.ts`
2. Create repository files
3. Create schema files

### Step 3: API Routes & Actions
1. Create API routes for each entity
2. Create server actions

### Step 4: Update Client Code
1. Update login/signup forms
2. Update dashboard pages
3. Update middleware logic

### Step 5: AI Refactor
1. Extract prompts
2. Extract tool detection
3. Improve logging

---

## Environment Variables Required

Ensure these are set in Vercel:
```
# AWS
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1:xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxx

# App
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app

# Apollo (if needed)
APOLLO_API_KEY=xxxxx

# Vercel KV (if using for cache)
KV_REST_API_URL=xxxxx
KV_REST_API_TOKEN=xxxxx
```

---

## Testing Checklist

- [ ] Login flow works with cookies
- [ ] Signup flow works with cookies
- [ ] Middleware blocks unauthenticated access
- [ ] Tenant isolation works (can't access other tenant data)
- [ ] API routes work with authenticated requests
- [ ] Dashboard pages load data correctly
- [ ] AI assistant works with new architecture
- [ ] No AWS SDK in client bundle
- [ ] No localStorage for auth tokens

---

## Rollback Plan

If issues arise:
1. Keep old auth.ts working in parallel
2. Use feature flags for gradual rollout
3. Log all auth failures for debugging
