# Turnkey Optimization - Project Context (Always Reference This)

## Vision
Recruiting CRM for small agencies/solo recruiters. Minimal clicks, deep AI (Apollo, Bedrock, resume parsing), full pipeline visibility.

## Core Entities & Relationships (Non-Negotiable)
- **Companies**: Top-level parent.
- **Contacts**: Always linked to exactly one Company.
- **Jobs**: Linked to one Company + one or more Candidates.
- **Candidates**: Mostly independent, but can link to multiple Jobs.

**Rules**:
- No orphaned records on delete.
- All links are bidirectional where it makes sense (e.g., Company shows its Contacts/Jobs).
- Full CRUD (Create, Read, Update, Delete) on every entity.
- Parent list pages + drill-down detail pages (like the Paul Kiedis contact view: timeline + sidebar).

## Development Rules
- Always work in feature branches: `feat/xxx`, `fix/yyy`.
- Push → Vercel auto-creates Preview deployment.
- Test full relevant regression checklist in Preview before merging.
- Use existing patterns: repositories, server actions, TanStack Query hooks, event recording.
- Enforce tenant isolation everywhere (never hardcode "default-tenant").
- Record events for every mutation.

## UI Style
Modern, clean, blue accents. Sidebar navigation. Detail pages with Activity Timeline + right sidebar (stats, quick links, open jobs, etc.). Match the Paul Kiedis screenshot style.

## Tech
Next.js App Router, TypeScript, DynamoDB (single-table + events), Cognito, Vercel, AWS services.

Reference this file + `ARCHITECTURE.md` + `REGRESSION_CHECKLIST.md` in every task.