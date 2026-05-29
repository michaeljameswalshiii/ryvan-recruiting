# PROJECT_GOALS.md

## Vision

**Turnkey Optimization** is a highly efficient, AI-powered ATS and recruiting workflow platform designed specifically for **small recruiting agencies and solo practitioners**.

The core philosophy: **minimum clicks, maximum leverage**.  
Blend best-in-class workflow efficiency, robust pipeline management, and deep AI capabilities so users can source, qualify, track, and close more placements faster — with far less administrative overhead.

### Core Value Proposition
- **Efficiency-first UX** — Every action optimized for speed.
- **AI that actually works** — Deep integration with Apollo + internal data + reasoning agents.
- **Low-cost, full ownership** — Built on AWS for control and predictable pricing.
- **Turnkey for real recruiters** — Not bloated enterprise software.

**"Aha" moment**: A solo recruiter or small agency owner opens one dashboard, runs an AI search, drags qualified leads into pipelines, tracks every interaction, and sees clear reporting — all without switching between 5 different tools.

## Target Users

**Primary**:
- Owners of small recruiting companies (1–10 recruiters)
- Solo recruiters / independent practitioners

**Secondary**:
- Recruiting teams transitioning from spreadsheets or fragmented tools

## Key Differentiators

- **AI Depth** — Intelligent agents that combine Apollo enrichment, internal pipeline knowledge, and web search.
- **Workflow Superiority** — Kanban pipelines for both **Candidates** and **Companies**, event timeline tracking, minimal-click actions.
- **Robust Dashboarding & Reporting** — QuickSight + in-app metrics.
- **Cost Efficiency** — Self-hosted on AWS (move off Vercel post-pilot).
- **Tenant Isolation & Security** — Mandatory multi-tenancy from day one.

## Current Strengths

- Kanban boards (Candidates & Companies) — feels polished and intuitive.
- Multi-tenant Cognito + DynamoDB foundation.
- AI Bedrock layer with tool use (Apollo, Tavily, internal data).
- Import flows and basic activity tracking.

## Top Priorities (Next 1–3 Months)

### Critical Fixes & Features
1. **AI Apollo Search Reliability** (biggest pain point)
   - Fix search stability and result quality.
   - Improve parsing, error handling, and user feedback.

2. **Resume Upload & Parsing**
   - Reliable PDF/text resume upload with accurate data extraction.
   - Auto-populate candidate profiles.

3. **Jobs Module**
   - Add ability to create/post Jobs.
   - Match Jobs ↔ Companies ↔ Candidates.
   - Refactor existing "Leads" into proper Jobs where needed.

4. **Company Contacts**
   - Support multiple contacts per Company record.
   - Roll-up view and easy navigation.

5. **Enhanced Candidate Detail View**
   - Full timeline, notes, attachments, resume display, activity log.

### Ongoing Foundations
- Drag-and-drop refinements on both pipelines.
- Strong tenant isolation in all AI tools and data access.
- AI cost tracking and guardrails.
- Reporting dashboard expansion (QuickSight + Recharts).

## Architecture & Tech Goals

- **Hosting**: AWS-native (CDK, DynamoDB, Bedrock, Cognito, eventually Lambda/Step Functions). Transition off Vercel after pilot.
- **Scalability & Security**: Strict tenant isolation everywhere. No cross-tenant data leakage.
- **Future Expansions** (in scope):
  - ATS synchronization.
  - Email + SMS/text integration.
  - Additional AI agents (e.g., outreach, qualification, matching).
- **AI Cost Control**: Logging, token tracking, model selection strategy.

## Non-Goals (for now)

- Large enterprise features (complex approvals, heavy compliance, 1000+ user support).
- White-label / multi-brand (unless requested later).
- Mobile-native app (responsive web first).

## Success Criteria

- **Primary**: Positive user feedback from pilot users (solo recruiters and small agency owners).
- Users report saving significant time vs. current tool stack.
- AI Apollo search becomes reliable and frequently used.
- Smooth onboarding — new user can be productive within minutes.
- Stable, low-friction deployment and maintenance on AWS.

## Roadmap Outline

**Phase 1 (Current → MVP Polish)**: Apollo fixes, resume parsing, Jobs + matching, Company contacts, Candidate detail.

**Phase 2**: Advanced reporting, email/SMS integration, AI agent improvements, cost dashboards.

**Phase 3**: ATS sync, more automation, pricing tiers / billing.

**Long-term**: Marketplace of AI agents, advanced analytics, team collaboration features.

## AI Development Workflow & Operating Parameters

We use **MiniMax M2.7** (via Blackbox AI, Claude Code Extension, or MiniMax VS Code Assistant) as the primary agent for development.

### Core Operating Principles (for optimal speed + quality)

- **Primary Model**: `MiniMax-M2.7` (or `MiniMax-M2.7-highspeed` when speed is critical)
- **Default Mode**: Builder / Agentic mode (not just chat)
- **Multi-Agent Usage**:
  - Use `/multi-agent` or the parallel agent checkbox for complex features (Events, Apollo fixes, matching engine, etc.).
  - Always run at least 2–3 agents in parallel + Chairman review for critical code.
  - Leverage native Agent Teams when available.

- **Project Context**:
  - Always keep `AGENT_GUIDELINES.md` or `PROJECT_GOALS.md` in context.
  - Use `@filename` for relevant files.
  - Drop a `.blackbox/skills/` or `agent.md` file with recurring patterns (DynamoDB single-table, tenant isolation, etc.).

- **Quality Guardrails**:
  - Temperature: 0.0–0.3 for code generation (deterministic).
  - Require TypeScript strict mode, proper error handling, and tenant isolation on every change.
  - Mandatory: Add/update tests or manual verification steps.
  - All new features must reference relevant sections from PROJECT_GOALS.md or EVENTS_ARCHITECTURE.md.

- **Workflow Commands** (Blackbox / MiniMax):
  - `/multi-agent` → for parallel execution + Chairman merge.
  - Plan → Build → Review cycle for every non-trivial task.
  - Use MCP tools where available for DynamoDB inspection, API calls, etc.

- **Branching Rule**:
  - All agent-generated code goes into feature branches prefixed with `m2.7/` or `blackbox/`.
  - Human review + manual test before merging to main.

### Success Metrics for AI-Assisted Development
- Average feature implementation time < 4 hours for medium complexity.
- < 10% rework rate after PR review.
- Consistent tenant isolation and code quality.

This setup maximizes both velocity and reliability.

---

*Last Updated*: May 2025  
*Owner*: [Your Name]  
*Status*: Active Development – Focused on Core Workflow + AI Reliability

---

This document serves as the **north star** for all development decisions.
