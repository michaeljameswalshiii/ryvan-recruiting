# Refactoring Brainstorm - Comprehensive Plan

## Current Project Status Analysis

### ✅ COMPLETED (from REFACTOR_PLAN.md):

| Item | File | Status |
|------|------|--------|
| Server-only auth | `src/lib/server-auth.ts` | ✅ Complete |
| Middleware | `src/middleware.ts` | ✅ Complete |
| Cache utility | `src/lib/cache.ts` | ✅ Complete |
| Server DynamoDB | `src/lib/db/dynamodb.ts` | ✅ Complete |
| Auth schemas | `src/lib/schemas/auth.ts` | ✅ Complete |
| Client schemas | `src/lib/schemas/client.ts` | ✅ Complete |
| Lead schemas | `src/lib/schemas/lead.ts` | ✅ Complete |
| Client repository | `src/lib/db/repositories/client-repository.ts` | ✅ Complete |
| Auth API - login | `src/app/api/auth/login/route.ts` | ✅ Complete |
| Auth API - register | `src/app/api/auth/register/route.ts` | ✅ Complete |
| Auth API - session | `src/app/api/auth/session/route.ts` | ✅ Complete |
| Data API - clients | `src/app/api/data/clients/route.ts` | ✅ Complete |
| System prompt | `src/lib/prompts/bedrock-system.ts` | ✅ Complete |

### ❌ CRITICAL ISSUES NOT YET FIXED:

| Issue | File | Security Risk |
|-------|------|---------------|
| localStorage tokens | `src/lib/auth.ts` | 🔴 HIGH - XSS vulnerable |
| AWS SDK on client | `src/lib/aws.ts` | 🔴 HIGH - Can access DB from browser |
| Login uses auth.ts | `src/components/forms/login-form.tsx` | 🔴 HIGH |
| Signup uses auth.ts | `src/components/forms/signup-form.tsx` | 🔴 HIGH |
| Companies uses aws.ts | `src/app/dashboard/companies/page.tsx` | 🔴 HIGH |
| Pipeline likely uses aws.ts | `src/app/dashboard/pipeline/page.tsx` | 🔴 HIGH |

## Detailed Refactoring Plan

### Phase 1: Fix Login Form & Auth Flow (HIGHEST PRIORITY)

#### Step 1.1: Create Server Actions for Auth

Create `src/lib/actions/auth-actions.ts`:

```typescript
'use server'

import { redirect } from 'next/navigation'
import { authenticateUser, registerUser } from '@/lib/server-auth'
import { loginSchema, registerSchema } from '@/lib/schemas/auth'

export async function loginAction(formData: FormData) {
  'use server'
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  // Validate
  const validated = loginSchema.safeParse({ email, password })
  if (!validated.success) {
    return { error: 'Invalid credentials' }
  }
  
  try {
    await authenticateUser(email, password)
    redirect('/dashboard')
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function registerAction(formData: FormData) {
  'use server'
  
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
    fullName: formData.get('fullName') as string,
    tenantName: formData.get('tenantName') as string,
    subdomain: formData.get('subdomain') as string,
  }
  
  // Validate
  const validated = registerSchema.safeParse(data)
  if (!validated.success) {
    return { error: 'Invalid registration data' }
  }
  
  try {
    await registerUser(data)
    redirect('/login?registered=true')
  } catch (error: any) {
    return { error: error.message }
  }
}
```

#### Step 1.2: Refactor Login Form

Replace `src/components/forms/login-form.tsx`:

- Use `useActionState` or Server Actions instead of client-side `signIn`
- Remove import of `auth.ts`
- Call server action via API route

**Key Changes:**
```typescript
// OLD (INSECURE)
import { signIn } from "@/lib/auth";
await signIn(data.email, data.password);

// NEW (SECURE) - Option 1: API Route
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  credentials: 'include', // Important for cookies
});

// NEW (SECURE) - Option 2: Server Action
'use server'
// Use loginAction from auth-actions.ts
```

#### Step 1.3: Refactor Signup Form

Same pattern as login form - use API route or server action.

---

### Phase 2: Fix Client Data Access (HIGH PRIORITY)

#### Step 2.1: Verify/Update Companies Page

Current: Uses `src/lib/aws.ts` directly (INSECURE!)

Should: Use API route `/api/data/clients` or server actions

**Current code:**
```typescript
// INSECURE - from companies/page.tsx
import { getClients, createClient, updateClient, deleteClient } from "@/lib/aws";

// This calls AWS SDK directly from client!
const dbCompanies = await getClients(tenantId);
```

**Refactor to:**
```typescript
// SECURE - use API route
const response = await fetch('/api/data/clients', {
  headers: {
    // Tenant ID from session cookie (verified by middleware)
  },
});
const clients = await response.json();
```

#### Step 2.2: Verify/Update Pipeline Page

Similar refactor needed for pipeline page.

---

### Phase 3: Deprecate Insecure Files

#### Step 3.1: Mark auth.ts as Deprecated

Update `src/lib/auth.ts`:

```typescript
/**
 * @deprecated Use /api/auth/login instead, or use server-auth.ts for server-side only
 * This file is kept for backwards compatibility only!
 * @security WARNING: Stores tokens in localStorage - XSS vulnerable!
 */
"use client";
// ... existing code but with deprecation warnings
```

#### Step 3.2: Mark aws.ts as Server-Only

Update `src/lib/aws.ts`:

```typescript
/**
 * @deprecated Use /api/data/* routes or server actions instead
 * @security WARNING: Should NEVER be imported in client components!
 */
// REMOVE "use client" directive
// This file should be server-only!
```

Actually, better to just create a new server-only file and mark the old one clearly:

```typescript
/**
 * ⚠️ DEPRECATED - DO NOT USE IN CLIENT CODE ⚠️
 * 
 * This file is kept for migration only.
 * 
 * Server-side: Use src/lib/server-auth.ts
 * Data access: Use /api/data/* routes
 * 
 * @deprecated as of 2024
 */
"use client";
// ... existing code
```

---

### Phase 4: Create Data Access Server Actions

#### Step 4.1: Create Client Server Actions

`src/lib/actions/client-actions.ts`:

```typescript
'use server'

import { validateSession } from '@/lib/server-auth'
import { createClientSchema } from '@/lib/schemas/client'
import { ClientRepository } from '@/lib/db/repositories/client-repository'

const clientRepo = new ClientRepository()

export async function getClientsAction() {
  const session = await validateSession()
  if (!session) throw new Error('Unauthorized')
  
  return clientRepo.getAll(session.tenantId)
}

export async function createClientAction(data: CreateClientInput) {
  const session = await validateSession()
  if (!session) throw new Error('Unauthorized')
  
  // Validate input
  const validated = createClientSchema.safeParse(data)
  if (!validated.success) {
    throw new Error('Invalid data')
  }
  
  // Force tenant_id from session (never trust client)
  return clientRepo.create(session.tenantId, validated.data)
}
```

---

## Implementation Order

### Immediate Actions (Today):

1. **Update login-form.tsx** - Use `/api/auth/login` instead of `auth.ts`
2. **Update signup-form.tsx** - Use `/api/auth/register` instead of `auth.ts`  
3. **Update companies/page.tsx** - Use `/api/data/clients` instead of `aws.ts`
4. **Update pipeline/page.tsx** - Similar fix

### After Testing Works:

5. **Add deprecation warnings** to `auth.ts` and `aws.ts`
6. **Phase 2 (Data Layer)** - Create server actions
7. **Phase 3 (AI)** - Refactor bedrock route

---

## Test Checklist

Before declaring success:

- [ ] Login flow uses httpOnly cookies
- [ ] No localStorage tokens (verify in browser dev tools)
- [ ] Middleware blocks unauthenticated access
- [ ] Companies load from API route
- [ ] Tenant isolation enforced (can't see other tenant data)
- [ ] No AWS SDK in client bundle (check network tab)
- [ ] Tokens not in cookie value visible to JS

---

## Files to Modify

### Login Form Refactor:
- `src/components/forms/login-form.tsx`

### Signup Form Refactor:
- `src/components/forms/signup-form.tsx`

### Data Pages Refactor:
- `src/app/dashboard/companies/page.tsx`
- `src/app/dashboard/pipeline/page.tsx` (check if exists)

### Deprecate:
- `src/lib/auth.ts` - Add deprecation notice
- `src/lib/aws.ts` - Add deprecation notice

### Create (if needed):
- `src/lib/actions/client-actions.ts`
- `src/lib/actions/lead-actions.ts`
- `src/lib/actions/pipeline-actions.ts`
