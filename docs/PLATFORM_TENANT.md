# Platform tenant model (Site Admins)

## Goal

Separate **platform operators** from **customer orgs**.

| Concept | Value |
|--------|--------|
| Platform home tenant id | `tenant-platform` |
| Who lives there | All `site_admin` users |
| Default session scope | `all` (All Tenants) |
| Customer data | Never stored under `tenant-platform` |

## How access works

1. **Profile** `tenant_id = tenant-platform` (home / membership only).
2. **Session** `tenantScope`:
   - `all` — platform overview; most CRM APIs require choosing a tenant
   - `<customer-tenant-id>` — operate inside that company’s data
3. Header **Tenant** dropdown lists **customer tenants only** (platform excluded).
4. **Site Admin → Tenants** can still show Platform as an internal row (`is_platform: true`).

## Code

- `src/lib/platform-tenant.ts` — constants + `ensurePlatformTenant()`
- Login / `setSessionCookie` — force home + default scope for site admins
- `getAllTenants({ includePlatform: false })` — default for pickers

## Migration

```bash
# with production AWS credentials
node scripts/migrate-site-admins-to-platform.mjs
```

Creates `tenant-platform` if missing and moves every `site_admin` profile onto it.

## Rules

- Do **not** put customer candidates/jobs on `tenant-platform`.
- Do **not** count platform members against a customer’s seat limit (they are not on that tenant).
- Promoting someone to `site_admin` should set `tenant_id` to `tenant-platform` (createProfile / login migration do this).
