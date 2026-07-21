# Turnkey / Trio — 12‑Month Financial Model

**Product:** Multi-tenant recruiting ATS (Turnkey Optimization / Trio / RYVAN dogfood)  
**Date:** 2026-07-18  
**Strategy:** Path A — sell to external agencies (founder-led, aggressive outbound)  
**Currency:** USD  

This is a **planning model**, not audited financials. Change assumptions in §1; outputs recalculate conceptually in §2–6.

---

## 1. Core assumptions

### 1.1 Pricing (from product roadmap)

| Plan | Monthly | Annual (pay upfront, ~2 mo free) | Notes |
|------|---------|----------------------------------|--------|
| **Pilot** (mo 1–2 only) | $400 | — | Discounted; ends by written date |
| **Starter** | $699 | $6,990 (~$583/mo equiv) | Core ATS + careers |
| **Growth** | $1,199 | $11,990 (~$999/mo equiv) | + AI + seats headroom |
| **Firm** | $2,500+ | custom | Out of model until year 2 |

**Blended ARPU targets (paying post-pilot):**

| Scenario | Blended ARPU / mo | Mix |
|----------|-------------------|-----|
| Conservative | $750 | 70% Starter / 30% Growth |
| Base | $950 | 50/50 |
| Aggressive | $1,100 | 35% Starter / 65% Growth |
| Stretch | $1,250 | Growth-heavy + seat add-ons |

### 1.2 Funnel (aggressive founder-led)

| Stage | Aggressive | Notes |
|-------|------------|--------|
| Outbound touches / week | 80–120 | LinkedIn + email + warm intros |
| Conversations / week | 8–12 | ~10% reply → booked |
| Demos / week | 3–5 | |
| Pilot closes / month | 2–4 | After month 2 |
| Pilot → paid conversion | 60% | Aggressive but realistic if sticky |
| Time pilot → paid | 45–60 days | |
| Logo churn / month | 3% | ~30% annual logo churn (early SaaS) |
| Seat expansion | +5% ARPU / qtr after m6 | Optional upside |

### 1.3 Cost structure (lean solo / small team)

| Cost | Monthly | Notes |
|------|---------|--------|
| Infra (AWS + Vercel + email) | $150–$400 | Scales slowly |
| AI / Bedrock / Apollo | $100–$800 | Usage-linked; BYOK reduces COGS |
| Tools (domain, analytics) | $50–$150 | |
| Founder salary (model) | $0 or $8,000 | Show both; default **$0 cash draw** for runway view |
| Contractor / support (from m4) | $0 → $2,000 | Part-time CS when >10 logos |
| Ads (optional aggressive) | $0–$2,000 | Default **$500** from m3 |
| **Base opex (no salary)** | **~$800–$1,500** early → **$3–5k** later | |

**Gross margin target:** 75–85% (SaaS + AI COGS). Model uses **80% contribution margin** on revenue after AI/infra variable costs (~20% of revenue).

### 1.4 Scenario definitions

| Scenario | New logos / mo (steady) | ARPU | Pilot→paid | Monthly churn |
|----------|-------------------------|------|------------|---------------|
| **A — Conservative** | 1 | $750 | 50% | 4% |
| **B — Base** | 2 | $950 | 55% | 3.5% |
| **C — Aggressive** (default) | 3 | $1,100 | 60% | 3% |
| **D — Stretch** | 4 | $1,250 | 65% | 2.5% |

Ramp: month 1 = billing live + first pilots; full logo add rate from **month 3**.

---

## 2. Monthly ramp — Scenario C (Aggressive) detail

### 2.1 Logo and MRR engine

Logic each month:

1. **New pilots started** → not full MRR (count at Pilot ARPU $400 for 1 month)  
2. **New paid logos** ≈ prior pilots × conversion lag (simplified: paid adds ≈ `steady_rate` from m3)  
3. **Churned logos** = beginning logos × monthly churn  
4. **EOM logos** = start + paid adds − churn  
5. **MRR** = EOM logos × blended ARPU (pilots counted separately at $400)

Simplified aggressive calendar (paid logos only in MRR table; pilots noted):

| Mo | New paid logos | Churned | EOM logos | Blended ARPU | **MRR** | **ARR run-rate** |
|----|----------------|---------|-----------|--------------|---------|------------------|
| 0 (today) | 0 | 0 | 0 | — | **$0** | $0 |
| 1 | 0 paid + 2 pilots | 0 | 0 paid | — | **~$800** pilot | — |
| 2 | 1 | 0 | 1 | $900 | **$900** | $11k |
| 3 | 2 | 0 | 3 | $1,000 | **$3,000** | $36k |
| 4 | 3 | 0 | 6 | $1,050 | **$6,300** | $76k |
| 5 | 3 | 0 | 9 | $1,100 | **$9,900** | $119k |
| 6 | 3 | 0 | 12 | $1,100 | **$13,200** | $158k |
| 7 | 3 | 0 | 15 | $1,100 | **$16,500** | $198k |
| 8 | 3 | 0 | 18 | $1,100 | **$19,800** | $238k |
| 9 | 3 | 1 | 20 | $1,100 | **$22,000** | $264k |
| 10 | 3 | 1 | 22 | $1,100 | **$24,200** | $290k |
| 11 | 3 | 1 | 24 | $1,100 | **$26,400** | $317k |
| 12 | 3 | 1 | 26 | $1,100 | **$28,600** | $343k |

**Year-end aggressive target: ~$28–30k MRR (~$340–360k ARR run-rate), ~25–28 paying logos.**

### 2.2 Gross adds vs net (year 1 totals)

| Metric | Aggressive |
|--------|------------|
| Gross paid logos added | ~28–32 |
| Churned | ~4–6 |
| Net EOM logos | **~26** |
| Ending MRR | **~$28,600** |
| Peak monthly logo adds | 3–4 |

---

## 3. All scenarios at a glance (month 12)

| | A Conservative | B Base | **C Aggressive** | D Stretch |
|--|----------------|--------|------------------|-----------|
| EOM logos | 8–10 | 16–18 | **25–28** | 35–40 |
| Blended ARPU | $750 | $950 | **$1,100** | $1,250 |
| **MRR** | **$6–8k** | **$15–17k** | **$28–30k** | **$45–50k** |
| **ARR run-rate** | ~$80k | ~$190k | **~$350k** | ~$570k |
| Year-1 cash collected* | ~$35–50k | ~$90–120k | **$160–220k** | $280–360k |

\*Cash lags MRR (ramp + pilot discounts + some annual prepay). Model cash ≈ **55–65% of average MRR × 12** in year 1 for monthly billing-heavy mix.

### 3.1 Cash collected approximation (Aggressive)

Assume mostly monthly billing; ~20% of logos flip to annual in H2.

| Quarter | Avg MRR | Cash (≈ 2.8–3.0× qtr-end MRR adj.) | Notes |
|---------|---------|-------------------------------------|--------|
| Q1 | ~$1.5k | ~$4–6k | Pilots + first paid |
| Q2 | ~$8k | ~$22–28k | |
| Q3 | ~$18k | ~$50–60k | Some annual |
| Q4 | ~$26k | ~$85–100k | |
| **Year 1 total cash** | | **~$160–195k** | Midpoint **~$180k** |

---

## 4. P&L sketch — Aggressive (year 1)

| Line | Low opex | With light team |
|------|----------|-----------------|
| Revenue (cash) | $180,000 | $180,000 |
| Variable AI/infra (~20%) | ($36,000) | ($36,000) |
| **Contribution** | **$144,000** | **$144,000** |
| Fixed tools/infra | ($12,000) | ($12,000) |
| Ads / outbound tools | ($6,000) | ($6,000) |
| Contractor CS (m4–12) | ($12,000) | ($18,000) |
| Founder draw | $0 | ($96,000) |
| **Approx. year-1 profit** | **+$110–120k** | **+$10–15k** |

**Interpretation:** Aggressive GTM is **highly cash-positive without a salary**, and roughly **breakeven with a modest founder draw** — if logo targets hold.

---

## 5. Unit economics

| Metric | Formula / value | Target |
|--------|-----------------|--------|
| **ARPU** | $1,100 / mo | $950–$1,250 |
| **Gross margin** | ~80% | >75% |
| **Logo CAC** (aggressive outbound) | $200–$800 (time + tools; ads extra) | < $1,500 |
| **CAC payback** | CAC / (ARPU × margin) | < 2 months if CAC <$1,500 |
| **LTV** (24 mo life, 80% GM) | 24 × $1,100 × 0.8 = **$21,120** | |
| **LTV** (if 30% annual churn ≈ 3.3 yr) | 40 × $1,100 × 0.8 ≈ **$35k** | |
| **LTV:CAC** | 15–50× at low CAC | >3× healthy; you should clear easily on founder sales |

**Warning:** Founder sales hide true CAC. At scale hire AE at $80–100k + commission → CAC rises to **$3–8k**; still OK if LTV > $20k.

---

## 6. Implied valuation

### 6.1 Today (pre-revenue)

| Method | Range | Mid |
|--------|-------|-----|
| Asset / rebuild partial | $150–600k | **$300k** |
| Strategic acquihire-ish | $200–500k | **$350k** |

### 6.2 At month 12 (if Aggressive hits)

| ARR run-rate | Multiple | Equity value |
|--------------|----------|--------------|
| $350k | 6× (early, unproven retention) | **$2.1M** |
| $350k | 8× | **$2.8M** |
| $350k | 12× (strong growth + AI story) | **$4.2M** |

### 6.3 Scenario grid (month-12 value @ 8× ARR)

| Scenario | ARR | @ 8× | @ 12× |
|----------|-----|------|-------|
| Conservative | $80k | $0.6M | $1.0M |
| Base | $190k | $1.5M | $2.3M |
| **Aggressive** | **$350k** | **$2.8M** | **$4.2M** |
| Stretch | $570k | $4.6M | $6.8M |

### 6.4 Path to $10M valuation (illustrative)

Need roughly **$800k–$1.2M ARR** at 8–12× → about **$70–100k MRR**  
→ ~**60–90 logos** at $1,100 ARPU, or fewer at higher Firm tier.  
**Timeline:** typically year 2–3 with sales hire + retention, not year 1.

---

## 7. Funnel capacity check (is 3 logos/mo possible?)

| Weekly activity | Volume | Conversion | Output |
|-----------------|--------|------------|--------|
| Touches | 100 | 10% reply | 10 replies |
| Replies → meeting | 10 | 50% | 5 meetings |
| Meetings → demo | 5 | 80% | 4 demos |
| Demos → pilot | 4 | 40% | ~1.6 pilots / week ≈ **6–7 / mo** |
| Pilots → paid (60%, lag) | | | **~3–4 paid / mo** steady state |

**Verdict:** 3 paid logos/month is aggressive but **mechanically feasible** with consistent outbound — product stickiness is the real gate, not calendar math.

---

## 8. 90-day cash plan (Aggressive)

| Week | Focus | $ outcome |
|------|--------|-----------|
| 1–2 | Stripe + seat limits live; pilot one-pager | $0 |
| 3–4 | 15–20 demos booked from pipeline | $0 |
| 5–8 | 2–3 pilots live @ $400 | **$800–$1,200** |
| 9–12 | Convert 1–2 to paid @ ~$1k; start 2 more pilots | **$2–4k MRR** |

**90-day success gate (from roadmap):** ≥1 external pilot live + path to **$1.5–3k MRR**.

---

## 9. Risks that break the model

| Risk | Impact on model | Mitigation |
|------|-----------------|------------|
| Billing slips 60+ days | Q1 cash ≈ 0; m12 MRR −30% | Ship Stripe in 30 days |
| Pilot→paid <40% | Ending MRR ~half | Job pipeline stickiness first |
| Churn >5%/mo | Ceiling ~$15k MRR | Onboarding + weekly check-ins |
| Support swamp | Founder can't sell | Fixed pilot SLA; no custom forks |
| Underpricing at $299 | Need 3× logos for same MRR | Anchor Growth at $1,199 |
| Isolation incident | Valuation → near zero | Tenant tests before pilot #2 |

---

## 10. Decision dashboard (what to track weekly)

1. **Pipeline:** demos booked / held  
2. **Pilots active** and **pilot→paid %**  
3. **MRR** and **net logo adds**  
4. **Support hours / tenant**  
5. **Time-to-first-candidate** (activation)  
6. **Cash in bank** vs opex  

---

## 11. Recommended operating targets

| Horizon | Primary target | Valuation implication |
|---------|----------------|----------------------|
| **Now** | Ship billing; 0 → 1 pilot | Asset ~$300k |
| **90 days** | $2k MRR, 2–4 external tenants | Still pre-scale |
| **6 months** | $12–15k MRR | ~$1–1.5M @ 8–10× |
| **12 months** | **$25–30k MRR** (Aggressive) | **~$2.5–4M** |
| **24 months** | $70–100k MRR | **~$7–12M** path |

---

## 12. How to use this model

1. Pick scenario **C** as the plan; use **B** for commitments.  
2. Update EOM logos + ARPU every month in a simple sheet (CSV companion).  
3. Recompute ARR × 8 and × 12 for “mark-to-market” equity.  
4. Do **not** raise or spend like Stretch until Base is beaten for 2 consecutive months.

---

## 13. One-line summary

| Question | Answer |
|----------|--------|
| Value today | **~$250–400k** (asset) |
| Aggressive monthly at 12 mo | **~$28–30k MRR** |
| Year-1 cash (aggressive) | **~$160–200k** |
| Equity if hit aggressive @ 8–12× | **~$2.8–4.2M** |
| Stretch monthly | **~$45–50k MRR** (~$5–7M equity @ 8–12×) |

---

*Aligned with `docs/PRODUCT_ROADMAP.md` Path A pricing. Revisit after first 3 paid logos.*
