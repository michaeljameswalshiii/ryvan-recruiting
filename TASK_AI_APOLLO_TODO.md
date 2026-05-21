# Task: AI Apollo - Add Companies and Open Roles Tabs

## Information Gathered:
1. Existing AI Apollo page at `src/app/dashboard/ai-apollo/page.tsx` with Chat and People Search tabs
2. Existing Apollo People API at `src/app/api/apollo/people/route.ts` (calls Apollo's `mixed_people/api_search`)
3. Need to add: Companies Tab and Open Roles Tab with new API routes

## Plan:

### Step 1: Update AI Apollo Page (src/app/dashboard/ai-apollo/page.tsx)
- Add Building2 and Briefcase icons from lucide-react
- Add CompanyResult and JobResult interfaces
- Add "companies" and "jobs" to TabsList (4 tabs total: chat, people, companies, jobs)
- Add Company search state and function
- Add Open Roles search state and function
- Add Companies tab content with search input, presets, and results grid
- Add Open Roles tab content with search input and results grid

### Step 2: Create Companies API (src/app/api/apollo/companies/route.ts)
- Create directory: src/app/api/apollo/companies/
- Create route.ts file
- Call Apollo's `mixed_companies/search` endpoint
- Return organizations data

### Step 3: Create Jobs API (src/app/api/apollo/jobs/route.ts)
- Create directory: src/app/api/apollo/jobs/
- Create route.ts file
- Call Apollo's companies endpoint (as placeholder, can expand to job postings later)
- Return jobs data

## Dependent Files to be edited:
1. `src/app/dashboard/ai-apollo/page.tsx` - Main update

## Dependent Files to be created:
1. `src/app/api/apollo/companies/route.ts` - New API
2. `src/app/api/apollo/jobs/route.ts` - New API

## Followup steps:
- Test the new tabs work correctly
- Verify API keys are properly configured
