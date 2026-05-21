# Smart Search Implementation Plan

## Information Gathered:
1. Current AI Apollo page has 4 tabs: Chat, People, Companies, Open Roles ✓
2. Basic expandQuery function exists that calls Bedrock
3. Switch component available at src/components/ui/switch.tsx
4. Apollo API routes exist at src/app/api/apollo/people, companies, jobs

## Plan: Add Smart Search Toggle with Enhanced Query Expansion

### Step 1: Import UI Components
- Add Switch import from @/components/ui/switch
- Add Label import from @/components/ui/label
- Already has Card component from @/components/ui/card

### Step 2: Add Smart Search State
- Add `smartSearchEnabled` state (default true)
- Add `expansionResult` state to store expanded query details

### Step 3: Improve expandQuery Function
- Return structured JSON with:
  - optimizedQuery: refined search string
  - personTitles: array of job titles to search
  - keywords: technical skills/keywords
  - technologies: tech stack
  - locations: geographic filters
  - industries: industry filters
  - seniorities: experience levels (senior, mid, junior)

### Step 4: Add ExpansionCard UI
- Show what Claude expanded when Smart Search is ON
- Display extracted filters in a collapsible card
- Show optimized query + all parsed filters

### Step 5: Update Search Functions
- Pass structured filters to Apollo APIs
- Use the parsed filters for better search results

## Dependent Files to be edited:
1. `src/app/dashboard/ai-apollo/page.tsx` - Main implementation

## Followup steps:
- Test the new toggle and expansion UI
- Verify Apollo API receives proper filters
