# Candidate Detail Page Implementation Plan

## Task
Create a full candidate detail / drill-down page that shows everything, including the EventTimeline.

## Implementation Steps

### Step 1: Create the candidate detail page
- File: `src/app/candidates/[id]/page.tsx`
- This will be a dynamic route page using the App Router

### Step 2: Layout Structure
```
+--------------------------------------------------+
|  ← Back    |  Candidate Name Avatar           |
|------------|----------------------------------|
|  [Send Email] [Add Note]                         |
+--------------------------------------------------+
|  [Overview] [Timeline] [Notes] [Emails] [Details] |
+--------------------------------------------------+
|                                                    |
|  Tab Content Area                                 |
|                                                    |
+--------------------------------------------------+
```

### Step 3: Tab Contents

1. **Overview Tab**
   - Contact info (email, phone)
   - Resume link
   - Current position
   - Company
   - LinkedIn URL

2. **Timeline Tab** (using EventTimeline component)
   - All activity events
   - Add note inline form

3. **Notes Tab**
   - List of all notes
   - Add note form

4. **Emails Tab**
   - List of emails sent to candidate
   - Subject, date, status

5. **Details Tab**
   - All other fields (source, created date, etc.)

### Step 4: Components to use
- Tabs, TabsList, TabsTrigger, TabsContent
- Badge (for status)
- Avatar (for candidate photo)
- Card (for sections)
- Button
- Input
- Textarea

### Step 5: States
- Loading: Show skeleton
- Error: Show error with retry button
- Not Found: Show "Candidate not found" message

## Dependencies
- @tanstack/react-query hooks
- lucide-react icons
- sonner for toasts

## Files to create/edit
1. Create: `src/app/candidates/[id]/page.tsx`
