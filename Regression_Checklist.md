# REGRESSION_CHECKLIST.md - Turnkey Optimization

**Purpose**: Quick manual regression checklist to run after major changes (especially after Minimax/Blackbox updates).

**Run this checklist** before merging big PRs or after deployments.

**Last Updated**: June 3, 2026

---

## Recent Fixes (June 3, 2026)
- [x] Fix "Requested resource not found" error on Jobs Pipeline page
  - Root cause: turnkey-jobs DynamoDB table did not exist
  - Solution: Created table via AWS CLI (temporary workaround)
  - Added jobs table definition to CDK for future deployments
  - Created migration script (scripts/migrate-leads-to-jobs.ts)

---

## Core Regression Tests

### 1. Candidate Management
- [ ] Create new candidate (manual + resume upload)
- [ ] Resume parsing works (name, email, phone, location, skills)
- [ ] Edit candidate in Overview (phone, email, location, salary)
- [ ] Email button works and records `EMAIL_SENT` event
- [ ] Resume viewer + download works
- [ ] Candidate appears in Kanban

### 2. Company / Contacts
- [ ] Create / edit company
- [ ] Add multiple contacts
- [ ] Set / change primary contact
- [ ] Contacts tab shows list correctly
- [ ] Contact changes record events in Timeline

### 3. Jobs Module (Replace Leads)
- [ ] Create a new Job
- [ ] Link candidate(s) to Job
- [ ] Change candidate stage inside Job
- [ ] Job appears in Company Detail ("Open Jobs")
- [ ] Job appears in Candidate Detail ("Linked Jobs")
- [ ] Jobs Kanban loads and displays correctly
- [ ] Sidebar menu shows "Jobs" (not Leads)

### 4. Events & Timeline
- [ ] Status change in Kanban creates event
- [ ] Note added creates event
- [ ] Email sent creates event
- [ ] Contact changes create events
- [ ] Job + candidate linking creates events
- [ ] Timeline shows correct order, icons, and details

### 5. General / Cross-Cutting
- [ ] Tenant isolation (switch tenants — no data leakage)
- [ ] Search / Apollo enrichment works
- [ ] Dashboard loads without errors
- [ ] All sidebar navigation works
- [ ] Mobile / responsive view is acceptable

---

## How to Run Regression
1. Deploy latest changes to Vercel preview or production
2. Use 2 different test tenants
3. Go through checklist
4. Add new tests as features are built

---

## Future Automated Tests (Nice to Have)
- Playwright / Cypress E2E tests
- Unit tests for repositories
- Resume parsing test suite with sample files

---

**Add new sections here as we build more features.**
