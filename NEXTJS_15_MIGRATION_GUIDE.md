# Next.js 15 Migration Guide

## Key Changes in Next.js 15

### 1. Dynamic Route Params are Now Promises

In Next.js 15, `params` in dynamic route segments (`[id]`, `[slug]`, etc.) are **Promises** instead of plain objects. This is a breaking change from Next.js 14.

#### The Error
```
Minified React error #130
Element type is invalid
args[]=undefined
```

This error typically means a component is `undefined` or a Promise was rendered instead of resolved.

#### The Fix

**Before (Next.js 14):**
```typescript
interface Props {
  params: { id: string };
}

export default async function Page({ params }: Props) {
  const candidate = await getLeadById(tenantId, params.id);
```

**After (Next.js 15):**
```typescript
interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const candidate = await getLeadById(tenantId, id);
```

### 2. Check These Files

All dynamic route pages should be checked and updated:

| File | Status |
|------|--------|
| `src/app/dashboard/candidates/[id]/page.tsx` | ✅ Fixed |
| `src/app/dashboard/contacts/[contactId]/page.tsx` | ✅ Already fixed |
| `src/app/dashboard/jobs/[id]/page.tsx` | ✅ Uses client component (safe) |
| `src/app/dashboard/companies/[id]/page.tsx` | ✅ Uses client component (safe) |

### 3. Server vs Client Components

- **Server Components**: Must use Promise-based params (async/await)
- **Client Components**: Use `useParams()` hook - this is handled automatically by Next.js

If your dynamic route page uses `"use client"`, it should work without changes because `useParams()` handles the Promise internally.

### 4. Testing Checklist

After updating, test these routes:
- [ ] `/dashboard/candidates/[any-id]`
- [ ] `/dashboard/companies/[any-id]`
- [ ] `/dashboard/jobs/[any-id]`
- [ ] `/dashboard/contacts/[any-contact-id]`

### 5. Build & Deploy

```bash
npm run build
npm run deploy
```

---

*Last Updated: May 2025*
*Related: GO.md, Project_Goals.md*
