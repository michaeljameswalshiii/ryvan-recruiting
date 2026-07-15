# GO.md - Developer Guidelines

## Purpose
This file documents best practices and workflows for the TurnkeyOptimization project.

## Current Deployment

**Live URL**: https://turnkey-optimization.vercel.app

**Login**: Use your Cognito / profile credentials. **Never commit passwords or API keys** to this repo.

**Vercel Project**: michaeljameswalshiiis-projects/turnkey-optimization

## Core Principles

### 1. Read Before Acting
- Before any task, analyze the full repo context
- Review environment_details for project structure
- List and read relevant MD files in root

### 2. Code Quality Standards
- TypeScript strict mode on all new code
- Proper error handling required
- Tenant isolation mandatory on every change

### 3. Deployment Workflow
- Make surgical, focused edits
- Push to GitHub: `git add -A; git commit -m "description"; git push origin master`
- Deploy: `npx vercel --prod --yes`
- Or trigger from Vercel dashboard

## Key Endpoints

### Authentication
- Login: `/api/auth/login` (uses DynamoDB fallback when Cognito not configured)
- Logout: `/api/auth/logout`
- Session: `/api/auth/session`

### API Routes
- Candidates: `/api/candidate/[id]` (GET, PUT, DELETE)
- Jobs: `/api/job/[id]`
- Companies: `/api/company/[id]`

### Dashboard Pages
- Candidates: `/dashboard/candidates`
- Jobs: `/dashboard/jobs`
- Companies: `/dashboard/companies`
- Pipeline: `/dashboard/pipeline`

## Edit/Delete Functionality
- Candidates: Detail page has Edit (navigates to `/edit` route) and Delete (with confirmation)
- Jobs: Detail page has Edit and Delete
- Companies: Detail page has Edit and Delete
- Contacts: Available in contact-info

## Development Commands

```bash
# Local development
npm run dev

# Build for production
npm run build

# Deploy to Vercel
npx vercel --prod --yes

# Set user password (local only)
node set-password.js email@domain.com password
```

## Key References
- `TODO.md` - Active tasks
- `Project_Goals.md` - Vision
- `FIX_BUILD_TODO.md` - Build fixes

---

*Last Updated*: June 2025
