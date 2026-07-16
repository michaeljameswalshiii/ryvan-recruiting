# Product Backlog

Living list of open work for Trio ATS / turnkey-optimization.  
Historical sprint TODOs live in `docs/archive/todos/`.

Last consolidated: 2026-07-14  
Reviewed with product: 1–3 P0; companies pipeline P1; reporting + dynamo admin removed; contacts + job events → P2.

---

## P0 — High value / known gaps

### 1. Email — inbound replies
**From:** `EMAIL_INTEGRATION_TODO.md`  
- [ ] Pull Gmail/Outlook replies into candidate (or contact) timeline  
- [ ] Webhook / Pub-Sub (Gmail) and Graph change notifications (Outlook)  
- [ ] Match inbound message to candidate by email address  

**Already done:** OAuth connect UI, send from profile (when env configured).

### 2. Email — production OAuth config
- [ ] Set `GMAIL_CLIENT_ID` / secret / redirect on Vercel  
- [ ] Set Outlook Azure app registration + env vars  
- [ ] Document setup in one place (or extend Settings help text)

### 3. Roles / permissions (RBAC)
**Shipped (foundation):** `site_admin` | `customer_admin` | `user`  
- [x] Load role from profile into session/layout  
- [x] Gate nav + pages (Admin vs Site Admin tools)  
- [x] Dynamo admin API = Site Admin only  
- [ ] Settings: list users + change roles within tenant  
- [ ] Optional: finer ATS permissions (view-only)

---

## P1 — Product polish

### 4. Companies pipeline model
- [ ] Align stage names (legacy 8-stage vs 5-stage “targeting/active/onhold…”)  
- [ ] Document canonical company stages in schema only  

---

## P2 — Nice to have / tech debt

### 5. Contacts consistency
- [ ] Single contacts story: company nested contacts vs `/contact-info` vs `/contacts`  
- [ ] Finish any remaining contact-info CRUD gaps if still present  

### 6. Job events stubs (build warnings)
Missing exports used by job API routes (not blocking day-to-day UI):  
- [ ] `recordCandidateLinked` / `Unlinked` / `StageChanged`  
- [ ] `recordJobCreated` / `Updated` / `StatusChanged`  
(See `src/lib/events/job-events.ts` + API imports.)

### 7. Resume parsing depth
- [ ] Richer fields (salary, full address, certs) if product needs them  

### 8. AI usage / BYOK
- [ ] Usage already logs; optional: real Bedrock token counts from API response  
- [ ] Grok/Anthropic usage split on Usage dashboard  

### 9. Tenant hygiene
- [ ] Clean orphan tenants / incomplete profiles  
- [ ] Demo tenant seed data pack (sample jobs, companies)  

### 10. Security
- [ ] Encrypt OAuth refresh tokens (KMS or app secret)  
- [ ] Rotate demo password policy if demos go external  

---

## Explicitly deferred / hold

| Item | Note |
|------|------|
| Full Email inbox rebuild | Hold (product decision) |
| External MCP servers | Future; tools registry is enough for now |
| Bulk brand rename | Abandoned earlier |
| Reporting KPI review / QuickSight embed | Removed from active backlog (existing reporting is enough for now) |
| Dynamo admin enhancements (query builder tabs) | Removed — current Dynamo Search is enough |

---

## How to use this file

1. Add new work here — **do not** create new root-level `*_TODO.md` files.  
2. When an item ships, check it off and move a one-line note under **Done** below.  
3. Old sprint docs: `docs/archive/todos/`.

## Done (recent)

- Issues module (list, detail, comments, attachments)  
- AI BYOK (Bedrock platform + Anthropic + Grok)  
- AI usage table + dashboard (ET timestamps)  
- Demo tenant + local demo user  
- Job candidate link via search picker  
- Full-page Add Company form  
- Candidates list refresh for multi-tenant  
