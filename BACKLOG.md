# Product Backlog

Living list of open work for Trio ATS / turnkey-optimization.  
Historical sprint TODOs live in `docs/archive/todos/`.

Last consolidated: 2026-07-14

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
Schema has `admin | member | viewer` but UI/API barely enforce it.  
- [ ] Load role from profile into session/layout  
- [ ] Gate admin tools (Dynamo Search, debug, usage)  
- [ ] Settings: list users + change roles  
- [ ] Optional: recruiter / sales roles for ATS

### 4. Job events stubs (build warnings)
Missing exports used by job API routes:  
- [ ] `recordCandidateLinked` / `Unlinked` / `StageChanged`  
- [ ] `recordJobCreated` / `Updated` / `StatusChanged`  
(See `src/lib/events/job-events.ts` + API imports.)

---

## P1 — Product polish

### 5. Contacts consistency
- [ ] Single contacts story: company nested contacts vs `/contact-info` vs `/contacts`  
- [ ] Finish any remaining contact-info CRUD gaps if still present  

### 6. Companies pipeline model
- [ ] Align stage names (legacy 8-stage vs 5-stage “targeting/active/onhold…”)  
- [ ] Document canonical company stages in schema only  

### 7. Reporting
- [ ] Confirm Recharts dashboard covers KPIs you care about  
- [ ] Optional: QuickSight embed when Athena tables ready  

### 8. Dynamo admin enhancements (optional)
- [ ] Schema / query builder tabs on Dynamo Search  
- [ ] Safer delete confirmations  

---

## P2 — Nice to have

### 9. Resume parsing depth
- [ ] Richer fields (salary, full address, certs) if product needs them  

### 10. AI usage / BYOK
- [ ] Usage already logs; optional: real Bedrock token counts from API response  
- [ ] Grok/Anthropic usage split on Usage dashboard  

### 11. Tenant hygiene
- [ ] Clean orphan tenants / incomplete profiles  
- [ ] Demo tenant seed data pack (sample jobs, companies)  

### 12. Security
- [ ] Encrypt OAuth refresh tokens (KMS or app secret)  
- [ ] Rotate demo password policy if demos go external  

---

## Explicitly deferred / hold

| Item | Note |
|------|------|
| Full Email inbox rebuild | Hold (product decision) |
| External MCP servers | Future; tools registry is enough for now |
| Bulk brand rename | Abandoned earlier |

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
