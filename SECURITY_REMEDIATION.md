# Security Remediation Plan

This document is the checklist from the 2026 security review of
`turnkey-optimization`, plus what was fixed in the first hardening PR.

**Assume all previously committed secrets and passwords are compromised.**

---

## Status legend

- [x] Done in code (this hardening pass)
- [ ] Still required (ops / follow-up PR)

---

## P0 — Incident response (do immediately, outside git)

### Rotate & revoke

- [ ] Change production login password(s) for any account that appeared in git history (e.g. former README / hard-coded logins)
- [ ] Rotate **Apollo** API key in Apollo dashboard; update Vercel `APOLLO_API_KEY`
- [ ] Rotate **Gmail** app password / OAuth client secret if `.env.gmail` was ever real
- [ ] Rotate **AWS** access keys used by Vercel / local scripts if they may have been exposed
- [ ] Rotate **Vercel** tokens / re-pull env (`vercel env pull` only locally; never commit)
- [ ] Rotate **Groq / Anthropic / other** AI keys if present in Vercel or old commits
- [ ] Set a strong unique `AI_CREDENTIALS_SECRET` on Vercel (required for BYOK encryption in production)
- [ ] Invalidate active sessions (force Cognito global sign-out / clear cookie secret if you add signing)

### Repository exposure

- [ ] Make the GitHub repo **private** until history is scrubbed (or keep private permanently)
- [ ] Remove secrets from **git history** (current tree cleanup is not enough):
  - Use `git filter-repo` or BFG on paths: `.env*`, old scripts with keys
  - Force-push only after team agreement; re-clone all machines
- [ ] Scan history: `gitleaks detect --source . -v` (or GitHub secret scanning)
- [ ] Confirm Vercel deploy does **not** bake `.env.production` from the repo

### Runtime kill-switches (optional while fixing)

- [ ] Set `ADMIN_API_DISABLED=true` on Vercel if you need to hard-block admin DynamoDB
- [ ] Set `ADMIN_EMAIL_ALLOWLIST=you@yourdomain.com` for admin DynamoDB access
- [ ] Temporarily disable public signup in Cognito if spam/abuse appears

---

## P0 — Code / tree (implemented in hardening pass)

- [x] Remove live credentials from `ReadMe.md` / `GO.md`
- [x] Remove hard-coded `DEMO_USER` / `DEMO_TENANT_USER` backdoors from `/api/auth/login`
- [x] Stop logging login request bodies (password leak to logs)
- [x] Require admin session on `/api/admin/dynamodb` (all methods)
- [x] Protect `/admin` and `/api/admin` in middleware (API → 401, pages → login)
- [x] Untrack committed env dumps (`.env.gmail`, `.env.production`, `.env.vercel*`)
- [x] Expand `.gitignore` for env/secrets patterns
- [x] Scrub hard-coded Apollo keys and passwords from ops/test scripts
- [x] Stop falling back to AWS secret / hard-coded string for BYOK encryption key in production

---

## P1 — Auth hardening (next PR)

- [ ] Replace unsigned `turnkey-session` JSON cookie with **signed** session (iron-session / JWT with HMAC) or store only a session id server-side
- [ ] Validate session on **every** mutating and data API (no “allow with warning”)
- [ ] Require auth on `/api/apollo`, `/api/tavily`, `/api/boolean`, `/api/bedrock` (remove from public middleware list)
- [ ] Add rate limits on login + paid third-party proxies
- [ ] Prefer `aws-jwt-verify` for Cognito tokens instead of GetUser on every request
- [ ] Remove or env-gate `/dashboard/debug-env`
- [ ] Ensure tenant isolation: never trust client-supplied `tenantId` query params for authorization

### Suggested PR split

| PR | Scope |
|----|--------|
| **PR1** | This file + secret scrub + admin lock + login backdoor removal (P0 code) |
| **PR2** | Signed sessions + middleware enforce-auth for all `/api/*` except auth/oauth callbacks |
| **PR3** | Auth-gate Apollo/Bedrock/Tavily + rate limits |
| **PR4** | Remove root ops scripts from deploy (`vercelignore` / move to private `scripts-private/`) |
| **PR5** | History rewrite + public→private decision + dependency audit |

---

## P2 — Hardening & hygiene

- [ ] Delete or private-only: `check-*.js`, `delete-user.js`, `cleanup-*.js` that assume AWS admin
- [ ] Disable open registration or require invite codes
- [ ] Encrypt OAuth refresh tokens at rest (BACKLOG already notes this)
- [ ] CSP / security headers via Next.js config
- [ ] Dependabot + `npm audit` in CI
- [ ] Structured audit log for admin DynamoDB mutations (who/what/when)
- [ ] Separate **demo** AWS account / DynamoDB tables from production

---

## Verification checklist (after PR1 deploys)

- [ ] `GET /api/admin/dynamodb` without cookie → **401**
- [ ] Logged-in non-admin → **403**
- [ ] Admin (role=admin or allowlist) → 200 with tables
- [ ] Login with old hard-coded demo passwords → **401**
- [ ] Login with real Cognito / password_hash user → **200** + httpOnly cookie
- [ ] `git ls-files | findstr /i env` shows only `.env.example`
- [ ] Repo search for former secrets returns no matches on `master`

---

## Env vars to set (Vercel production)

| Variable | Purpose |
|----------|---------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Server AWS (prefer least-privilege IAM) |
| `COGNITO_*` / `NEXT_PUBLIC_COGNITO_*` | Auth |
| `APOLLO_API_KEY` | Apollo (server only) |
| `AI_CREDENTIALS_SECRET` | BYOK encryption (required in prod) |
| `ADMIN_EMAIL_ALLOWLIST` | Optional extra admin gate |
| `ADMIN_API_DISABLED` | Emergency kill-switch for admin API |

Never put secrets in `NEXT_PUBLIC_*` variables.

---

## Contact / ownership

After rotation, update password managers only — **not** this repository.
