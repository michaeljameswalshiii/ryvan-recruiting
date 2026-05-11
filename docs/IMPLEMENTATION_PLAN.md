# Implementation Plan - Secure Auth & Data Access Refactor

## 🎯 Current Status: Infrastructure Complete, Integration Pending

The secure infrastructure already exists:
- ✅ Server-auth (`src/lib/server-auth.ts`) - httpOnly cookies
- ✅ Auth API routes (`/api/auth/login`, `/api/auth/register`)
- ✅ Client API wrapper (`src/lib/api/client-api.ts`) 
- ✅ Middleware protection

**BUT** - Forms and pages are still using insecure old code!

---

## 🔴 CRITICAL: Security Vulnerabilities

| File | Current (Insecure) | Should Use |
|------|-------------------|-----------|
| `login-form.tsx` | `signIn from "@/lib/auth"` | `login from "@/lib/api/auth-client"` |
| `signup-form.tsx` | `signUp from "@/lib/auth"` | `register from "@/lib/api/auth-client"` |
| `companies/page.tsx` | `getClients from "@/lib/aws"` | `fetchClients from "@/lib/api/client-api"` |

---

## ✅ Implementation Steps

### Step 1: Fix Login Form
**File:** `src/components/forms/login-form.tsx`

**Change:**
```typescript
// FROM:
import { signIn } from "@/lib/auth";
await signIn(data.email, data.password);

// TO:
import { login } from "@/lib/api/auth-client";
await login(data.email, data.password);
```

### Step 2: Fix Signup Form
**File:** `src/components/forms/signup-form.tsx`

**Change:**
```typescript
// FROM:
import { signUp } from "@/lib/auth";
await signUp(data.email, data.password, data.tenantName, data.subdomain, data.fullName);

// TO:
import { register } from "@/lib/api/auth-client";
await register(data.email, data.password, data.fullName, data.tenantName, data.subdomain);
```

### Step 3: Fix Companies Page
**File:** `src/app/dashboard/companies/page.tsx`

**Changes:**
```typescript
// FROM:
import { getClients, createClient, updateClient, deleteClient } from "@/lib/aws";

// TO:
import { fetchClients, createClient, updateClient, deleteClient } from "@/lib/api/client-api";

// Also change:
const dbCompanies = await getClients(tenantId);
const dbCompanies = await fetchClients(); // Uses cookie auth automatically
```

### Step 4: Check/Fix Pipeline Page
**File:** `src/app/dashboard/pipeline/page.tsx`
Similar changes needed.

---

## 📋 Files to Modify

1. ✅ `src/components/forms/login-form.tsx` - Fix import + method
2. ✅ `src/components/forms/signup-form.tsx` - Fix import + method
3. ✅ `src/app/dashboard/companies/page.tsx` - Fix imports + API calls
4. ✅ `src/app/dashboard/pipeline/page.tsx` - Uses secure client-api ✅

---

## 🔒 After Fixes Applied

- Tokens stored in httpOnly cookies (not localStorage)
- AWS SDK never loaded in browser
- All data access via API routes
- Middleware enforces auth

---

## 🧪 Testing Checklist

- [ ] Login works → redirected to dashboard
- [ ] No "accessToken" in localStorage (check dev tools)
- [ ] No "accessToken" visible in cookie (inspect cookie)
- [ ] Companies load from API
- [ ] Signup works → redirected to login
- [ ] Logout clears cookie
