# Careers site integration (Squarespace, WordPress, Next.js)

Post jobs **once in the ATS**. External sites only list Open roles and send applications back.

## Auth model (public exception)

The ATS requires login for `/dashboard/*`. **Careers does not.**

| Surface | Auth | How |
|---------|------|-----|
| `/careers`, `/careers/{tenant}`, `/careers/{tenant}/{jobId}` | **Public** | Middleware `PUBLIC_PAGE_ROUTES` |
| `/api/public/careers/*` (jobs, apply, logo) | **Public** | Middleware `PUBLIC_API_ROUTES` + no session in handlers |
| `/dashboard/*`, internal candidates, admin | **Login required** | Middleware `PROTECTED_ROUTES` |

Tenant is resolved from the **URL slug** (or `CAREERS_TENANT_ID` / `CAREERS_TENANT_SLUGS` env), never from a user session. That keeps multi-tenant isolation without cookies.

Optional `CAREERS_PUBLIC_KEY` is a **site key** (not a user password) for embed/API callers — not required for the hosted `/careers` pages.

## Setup (Vercel env)

| Variable | Required | Purpose |
|----------|----------|---------|
| `CAREERS_TENANT_ID` | **Yes** | Your tenant id (same as session `tenantId`) |
| `CAREERS_PUBLIC_KEY` | Optional | If set, require `x-careers-key` or `?key=` on API |
| `CAREERS_CORS_ORIGINS` | Optional | `*` (default) or `https://www.yoursite.com,https://yoursite.squarespace.com` |
| `CAREERS_TENANT_SLUGS` | Optional | `ryvan:tenant-xxx,acme:tenant-yyy` for multi-brand |
| `NEXT_PUBLIC_APP_URL` | Recommended | `https://turnkey-optimization.vercel.app` for correct apply links |

After setting env vars, **redeploy**.

## Endpoints

### List open jobs

```http
GET /api/public/careers/jobs
GET /api/public/careers/jobs?id={jobId}
```

Optional: `?tenant=slug` · `?key=...`

### Apply

```http
POST /api/public/careers/apply
Content-Type: application/json

{
  "jobId": "...",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "",
  "message": "",
  "resumeUrl": "",
  "website": ""
}
```

`website` is a honeypot — leave empty.  
Creates a candidate (`source: website-careers`) and links them to the job.

## Hosted careers pages (no Squarespace code needed)

- List: `https://YOUR-APP/careers` or `/careers/{tenantSlug}`
- Detail + apply: `https://YOUR-APP/careers/{tenantSlug}/{jobId}`
- **Join our talent network** (always on the list page): general resume for future roles — creates a candidate with source `website-careers-talent-network`, no job link. Form field `interests` = role preferences free text. API: `POST /api/public/careers/apply` with `mode=talent_network` (multipart; resume required; no `jobId`).

On Squarespace: add a **button/link** “Careers” → `/careers`, or embed with an iframe:

```html
<iframe
  src="https://YOUR-APP/careers"
  style="width:100%;min-height:800px;border:0"
  title="Open roles"
></iframe>
```

## Squarespace Code block embed (jobs stay on your page)

1. Add a **Code** block on your Careers page.
2. Paste:

```html
<div id="turnkey-careers"></div>
<script
  src="https://YOUR-APP/careers-embed.js"
  data-api-base="https://YOUR-APP"
  data-container="turnkey-careers"
  data-key=""
  data-tenant=""
  defer
></script>
```

3. Replace `YOUR-APP` with your Vercel domain.  
4. If `CAREERS_PUBLIC_KEY` is set, put it in `data-key` (this is a **public** site key, not AWS secrets — still rotate if leaked).  
5. Job cards link to **Apply on the ATS careers page** so applications land in Turnkey.

## Workflow for recruiters

1. Create job in ATS (or General AI).  
2. Set status **Open**.  
3. Turn on **Show on website** (job detail page toggle, edit modal, or create form).  
4. It appears on `/careers` and any embed within seconds.  
5. Turn **Show on website** off → hidden from public feed even if still Open.  
6. Set **Closed** / **On Hold** → also disappears from the public feed.  
7. Applications show as candidates with source `website-careers`, linked to the job.

### Visibility rules

| Status | Show on website | Public careers? |
|--------|-----------------|-----------------|
| Open | On (or legacy unset) | **Yes** |
| Open | Off | No |
| Closed / On Hold | any | No |

Legacy jobs without the field stay public while Open (so existing listings do not vanish). New jobs default **off** until you opt in.

## Security notes

- Only **Open** jobs are exposed; candidates and internal notes are never returned.  
- Prefer locking CORS to your Squarespace domain in production.  
- Rate limits apply to list + apply endpoints.  
- Honeypot field reduces simple bot spam.
