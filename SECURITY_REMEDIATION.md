# Security Remediation Plan

This document is the checklist from the 2026 security review of
`turnkey-optimization`, plus what was fixed in hardening and hygiene passes.

**Assume all previously committed secrets and passwords are compromised.**

---

## Status legend

- [x] Done in code (committed on a branch)
- [ ] Still required (ops / partner action — **cannot be fixed by git alone**)

---

## P0 — Incident response (do immediately, outside git)

### Rotate & revoke (REQUIRED — secrets were in git history and/or tree)

Confirmed exposures as of the 2026-08 hygiene audit:

| Secret | Where seen | Action |
|--------|------------|--------|
| **Groq API key** (Groq `gsk` prefix) | Was in `src/lib/groq.ts` + `add_groq_key.py` until hygiene PR; also older history | **Revoke in Groq console now**; set only via Vercel/env |
| **AWS access key** (IAM access key id) | `.env.production` / history; local `.env.vercel.pull*` | **Deactivate in IAM**; create new least-privilege key for Vercel only |
| **Vercel OIDC / env dumps** | `.env.production` history | Re-pull env locally only; never commit |
| **Apollo / Gmail / other AI keys** | Prior env dumps | Rotate if those files ever held real values |
| **Login passwords** | Former README / hard-coded logins (removed in earlier hardening) | Change any password that was ever in git |

Checklist:

- [ ] Rotate **Groq** key (live key was in the public tree)
- [x] Rotate **AWS** access keys used by Vercel / local scripts (leaked key deleted; new key in Vercel production + local AWS CLI)
- [ ] Rotate **Apollo** API key; update Vercel `APOLLO_API_KEY`
- [ ] Rotate **Gmail** app password / OAuth client secret if `.env.gmail` was ever real
- [ ] Rotate **Vercel** tokens
- [ ] Rotate **Anthropic / other** AI keys if present in Vercel or old commits
- [ ] Set a strong unique `AI_CREDENTIALS_SECRET` on Vercel (required for BYOK encryption in production)
- [ ] Invalidate active sessions (Cognito global sign-out if needed)

### Repository exposure

- [x] Make the GitHub repo **private** (done 2026-08-03)
  - Owner: `michaeljameswalshiii/turnkey-optimization` — currently **public**
  - GitHub → Settings → Danger Zone → Change visibility → Private
- [x] Remove secrets from **git history** via `git filter-repo` + force-push (done 2026-08-03)
  - `git filter-repo` or BFG on paths: `.env*`, `add_groq_key.py`, `src/lib/groq.ts` (old blobs), old scripts with keys
  - Force-push only after team agreement; re-clone all machines
- [ ] Scan history: `gitleaks detect --source . -v` (or enable GitHub secret scanning)
- [ ] Confirm Vercel deploy does **not** bake `.env.production` from the repo

### Runtime kill-switches (optional while fixing)

- [ ] Set `ADMIN_API_DISABLED=true` on Vercel if you need to hard-block admin DynamoDB
- [ ] Set `ADMIN_EMAIL_ALLOWLIST=you@yourdomain.com` for admin DynamoDB access
- [ ] Temporarily disable public signup in Cognito if spam/abuse appears

---

## P0 — Code / tree (implemented)

### Hardening pass (earlier)

- [x] Remove live credentials from `ReadMe.md` / `GO.md`
- [x] Remove hard-coded `DEMO_USER` / `DEMO_TENANT_USER` backdoors from `/api/auth/login`
- [x] Stop logging login request bodies (password leak to logs)
- [x] Require admin session on `/api/admin/dynamodb` (all methods)
- [x] Protect `/admin` and `/api/admin` in middleware
- [x] Untrack committed env dumps (`.env.gmail`, `.env.production`, `.env.vercel*`)
- [x] Expand `.gitignore` for env/secrets patterns
- [x] Scrub hard-coded Apollo keys and passwords from ops/test scripts (partial)
- [x] Stop falling back to AWS secret / hard-coded string for BYOK encryption key in production

### Hygiene pass (2026-08 — this branch)

- [x] Remove **hardcoded Groq API key** from `src/lib/groq.ts` (env only)
- [x] Delete `add_groq_key.py` (contained live key)
- [x] Delete credential-injector scripts (`add-aws-creds.ps1`, `add-cognito-envs.ps1`, `add-vercel-envs.ps1`, `add-apollo-key.ps1`)
- [x] Delete Cognito/Dynamo dump JSON at root (`client-config.json`, `client-2.json`, etc.)
- [x] Delete production-mutating debug scripts from root (`delete-user.js`, `create-ryan-profile.js`, `check-*.js`, password scripts, etc.)
- [x] Delete throwaway deploy/fix artifacts (`commit-fix*.bat`, `deploy-temp.bat`, `VERCEL_FORCE_REDEPLOY.txt`, `temp_*`, etc.)
- [x] Delete root one-off `test-*.js` scripts (not unit tests)
- [x] Remove accidental nested submodule pointers (`candle-garden-estimator`, nested `turnkey-optimization*`)
- [x] Tighten `.gitignore` / `.vercelignore`
- [x] Document `scripts/` rules (`scripts/README.md`)

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
| **PR1** | Secret scrub + admin lock + login backdoor removal (done) |
| **PR1b** | Root hygiene + remove live Groq key from source (this pass) |
| **PR2** | Signed sessions + middleware enforce-auth for all `/api/*` except auth/oauth callbacks |
| **PR3** | Auth-gate Apollo/Bedrock/Tavily + rate limits |
| **PR4** | History rewrite + public→private decision + dependency audit |

---

## P2 — Hardening & hygiene

- [x] Delete root ops scripts that assume AWS admin (hygiene pass)
- [ ] Disable open registration or require invite codes
- [ ] Encrypt OAuth refresh tokens at rest (BACKLOG already notes this)
- [ ] CSP / security headers via Next.js config
- [ ] Dependabot + `npm audit` in CI
- [ ] Structured audit log for admin DynamoDB mutations (who/what/when)
- [ ] Separate **demo** AWS account / DynamoDB tables from production
- [ ] Move remaining root `*.md` design notes into `docs/` (optional cleanup)

---

## Verification checklist

- [ ] `GET /api/admin/dynamodb` without cookie → **401**
- [ ] Logged-in non-admin → **403**
- [ ] Admin (role=admin or allowlist) → 200 with tables
- [ ] Login with old hard-coded demo passwords → **401**
- [ ] Login with real Cognito / password_hash user → **200** + httpOnly cookie
- [ ] `git ls-files | findstr /i env` shows only `.env.example`
- [ ] Working tree has no hardcoded Groq keys (search source for Groq key prefixes)
- [ ] Repo is **private** (or history scrubbed if public)
- [ ] Groq + AWS keys rotated after hygiene merge

---

## Env vars to set (Vercel production)

| Variable | Purpose |
|----------|---------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Server AWS (prefer least-privilege IAM) |
| `COGNITO_*` / `NEXT_PUBLIC_COGNITO_*` | Auth |
| `APOLLO_API_KEY` | Apollo (server only) |
| `GROQ_API_KEY` | Groq (server only; no hardcoded fallback) |
| `AI_CREDENTIALS_SECRET` | BYOK encryption (required in prod) |
| `ADMIN_EMAIL_ALLOWLIST` | Optional extra admin gate |
| `ADMIN_API_DISABLED` | Emergency kill-switch for admin API |

Never put secrets in `NEXT_PUBLIC_*` variables (except Cognito pool/client IDs, which are public by design).

---

## Contact / ownership

After rotation, update password managers only — **not** this repository.

Partner workflow: raise P0 rotation + private-repo decision with the repo owner (`michaeljameswalshiii`) before any force-push history rewrite.

---

## Ops completion log

| Date | Action |
|------|--------|
| 2026-08-03 | Repo visibility ? **private** |
| 2026-08-03 | Merged PR #43 hygiene cleanup |
| 2026-08-03 | git filter-repo path purge + secret literal replacement; force-pushed all branches |
| 2026-08-03 | Deleted leaked AWS access key; created replacement; updated Vercel production + redeployed |
| 2026-08-03 | **Still required:** revoke Groq key in Groq console; rotate Apollo/Gmail/other if ever real in dumps; re-clone other local copies (Desktop, TurnkeyFresh) |
