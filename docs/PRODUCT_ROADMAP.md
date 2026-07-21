# Turnkey / RYVAN — Product roadmap (Path A primary)

**Primary path:** **A — Sell to other agencies**  
**Secondary:** RYVAN remains design partner #1 (dogfood), not the only customer forever  
**Date:** 2026-07-16  
**Thesis:** Multi-tenant recruiting workspace that turns careers applications + resumes into pipeline-ready candidates, keeps company contacts separate, and keeps stage + activity in sync—with optional AI for create/update.

---

## Decision

| Choice | Path A |
|--------|--------|
| **Goal** | ARR, logos, repeatable onboarding, sellable SaaS asset |
| **Success (90 days)** | 1–3 **paying or signed** external pilots + reliable self-serve/light-touch onboard |
| **North star metric** | Paying tenants (then seats, then MRR) |
| **Dogfood** | RYVAN uses the same pilot pack so demos stay honest |

---

## What Path A optimizes for

1. **Trust** — multi-tenant isolation, no “oops other firm’s candidates”  
2. **Time-to-value** — empty tenant → careers live → first apply → first candidate in &lt;1 day  
3. **Willingness to pay** — seat/plan limits + Stripe (or invoice)  
4. **Sticky daily loop** — job-linked pipeline good enough that pilots don’t bounce to spreadsheets  
5. **Narrow wedge** — win on *apply → pipeline speed*, not Bullhorn parity  

---

## Three bets (Path A order)

### 1. Commercial loop — Billing + seats *(#1 for Path A)*
- Stripe Checkout + Customer Portal **or** invoice + manual seats for first 3 pilots  
- Plan → seat limit + feature flags  
- Settings: plan, seats used/available, Manage billing  
- Soft block when over seats  

**Done when:** External tenant can pay (or LOI + invoice), invite users, hit a clear limit.

### 2. Onboarding + trust pack *(#1b — same sprint band as billing)*
- Empty-tenant checklist: company, job, careers brand, invite teammate  
- Isolation smoke tests (tenant A cannot read B)  
- Single clean “primary” demo tenant story (no dual-RYVAN confusion in demos)  
- Support SLA for pilots (e.g. email, 1 business day)  

**Done when:** You can onboard a stranger without a custom Slack thread of “set these 12 env vars.”

### 3. Sticky core — Job pipeline + apply quality *(#2 product)*
- Job detail: stage columns / board of linked candidates  
- Stage change from board **and** note types (no duplicate activity)  
- Careers apply → parse → linked job → sourced/submitted  
- Optional: light match score resume ↔ JD  

**Done when:** Pilot can run one live req without leaving the product for stage tracking.

### AI (supporting, not the sale)
- Keep confirmation gates  
- `create_contact` vs `create_candidate` discipline  
- Later: Bedrock parse fill + match — **demo wow**, not day-one dependency for close  

---

## 90-day milestones (Path A)

| Window | Focus | Exit criteria |
|--------|--------|----------------|
| **Days 1–30** | Billing + seats + Settings UX; isolation checklist; pilot offer one-pager | You can create a paid/pilot tenant and enforce seats |
| **Days 31–60** | Onboarding flow + job pipeline board + careers apply polish | 1 external pilot **live** on production |
| **Days 61–90** | Support playbook, 1–2 more pilots, price validation | **$ or signed LOI**; 2+ non-RYVAN tenants with activity |

---

## Pilot pack (what you sell first)

**Name (working):** Turnkey ATS — Agency Starter  

| Include | Exclude (for now) |
|---------|-------------------|
| Candidates + resume parse/replace | Full Reporting module |
| Companies + Contact Info | Email sequences / dialer |
| Jobs + link/unlink + stage | Marketplace of jobs across tenants |
| Careers page + brand logo | Native mobile |
| Dashboard pulse | Deep Bullhorn integrations |
| AI Assistant (create/update with confirm) | Unlimited seats free tier abuse |
| Seats per plan | Custom SSO (later Firm tier) |

**Pilot terms (suggested):**
- 30–90 days  
- 3–5 seats  
- $0–$500/mo pilot **or** $499–$999/mo early bird annual-intent  
- Weekly 30-min check-in for first month  
- Success = they process ≥1 req or ≥5 candidates fully in-app  

---

## Packaging (when formalizing)

| Tier | Include | Anchor |
|------|---------|--------|
| **Starter** | Core ATS + careers + dashboard | $99–$149/seat or $499–$799/mo flat |
| **Growth** | + AI + higher seats + match scores | $149–$199/seat or $999–$1,499/mo |
| **Firm** | + audit export, SSO later, multi-brand | Custom |

Price is a **hypothesis**—validate with 3 conversations before locking.

---

## What **not** to build (Path A discipline)

| Avoid | Why |
|--------|-----|
| Reporting revival in nav | Dashboard is enough for pilots |
| Feature parity with Bullhorn | You lose on breadth; win on speed |
| Public multi-tenant job board | Isolation + support nightmare |
| Heavy email marketing | One send + activity log later; not pilot blocker if optional |
| Perfect PDF engine | Good parse + manual edit is enough for pilots |
| Building only for RYVAN quirks | External pilot will reject overfit |
| Free forever unlimited | Kills Path A economics |

---

## Metrics (Path A scoreboard)

1. **Paying or LOI tenants** (primary)  
2. **Activated tenants** — invited ≥1 user, created ≥1 job, ≥1 candidate or apply  
3. **Time-to-first-candidate** for a new tenant  
4. **Weekly active seats** per tenant  
5. **Support hours / tenant / week** (must trend down)  
6. **Careers apply → usable candidate** rate  

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Sell before sticky | Job board + apply in days 31–60; demos use real RYVAN workflow |
| Support swamp | Fixed pilot SLA; written FAQ; no custom forks |
| Isolation incident | Automated tenant isolation tests before pilot #2 |
| AI wrong entity | Prompt + tool descriptions; never claim contact without `create_contact` |
| Underpricing | Pilot discount ≠ forever price; written end date |
| Dual internal tenants | One demo tenant; document which is “production RYVAN” |

---

## Competitive wedge (how you talk about it)

> “Other ATS tools are systems of record. We’re the **fastest path from careers apply and resume to a pipeline-ready candidate**, with company contacts kept separate—and AI that writes to the CRM only after you confirm.”

Don’t lead with “multi-tenant SaaS infrastructure.” Lead with **minutes saved per candidate**.

---

## Immediate next (when you choose to implement)

1. Stripe (or invoice) seats + Settings  
2. Isolation test suite + onboarding checklist in-app  
3. Job detail stage board  
4. Careers parse hardening  
5. First external pilot conversation with Pilot Pack PDF/one-pager  

---

## Explicit non-goals this quarter

- Rebuild Reporting  
- Sequences / cadence engine  
- Mobile apps  
- Marketplace  
- Expanding AI without CRM write confirmation  

---

*Path B (RYVAN-only) is demoted: still dogfood, not the definition of success.*
