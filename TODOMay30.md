# TODO.md - Turnkey Optimization

**Last Updated:** May 30, 2026

## High Priority Items

### 1. Resume Upload & Parsing (Critical)
- Improve resume upload reliability (PDF, Word, Google Docs)
- Accurate parsing into candidate fields (name, email, phone, experience, skills, etc.)
- Inline resume viewer in Candidate Overview
- Store original file + parsed data

### 2. Candidate Detail Page - Overview Polish
- Make Phone, Email, Location, Salary Requirements editable directly in Overview
- Add "Email" quick action button (fix if missing)
- Show Linked Jobs / Opportunities
- Company dropdown showing multiple contacts
- Important Notes section (rich text)
- Resume view section

### 3. Transform Leads → Jobs (Replace Completely)
- Rename Leads → Jobs everywhere (sidebar, Kanban, code, DB)
- Jobs linked to Company + multiple Candidates with stages
- Update Kanban to Jobs Pipeline
- Migration script for existing leads

### 4. Email & Activity Tracking
- Ensure Email button works and records `EMAIL_SENT` events
- Full tracking of emails (sent/received) in EventTimeline

### 5. Dashboard Enhancements (Phase 2)
- On-Deck / Active Candidates
- Open Jobs
- Companies with multiple contacts
- Interviews this week

## Medium Priority
- Bulk CSV import tool (from old ATS)
- User roles & permissions (Owner, Recruiter, Admin)
- Scalability & Security review
- Apollo Search reliability improvements

## Completed Recently
- ✅ Events Architecture + EventTimeline
- ✅ Multiple Contacts per Company
- ✅ Basic activity tracking (status changes, notes)

## Notes
- User-facing term = **"Company"** (not Client)
- Leads are being fully replaced by Jobs
- Maintain strict tenant isolation everywhere
- Minimum clicks philosophy

---

**Next Batch Focus**: Resume parsing + Candidate Overview polish
