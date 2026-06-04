# Candidates Page Reorganization Plan

## Overview
Move and reorganize the candidates pages:
- Current `/dashboard/candidates` (drag-and-drop Kanban) → `/dashboard/candidates-archive`
- Current `/candidates` (old pipeline) → `/dashboard/candidates` (with new 7 stages)

## Current State
- `/dashboard/candidates/page.tsx` - Has drag-and-drop Kanban with 7 stages: identification, attempted_outreach, conversation, candidate_presented, interview, accept, rejected
- `/candidates/page.tsx` - Has list view with old 5 stages: last18, submitted, interview, offer, accepted

## Target State
- `/dashboard/candidates-archive/page.tsx` - Copy of current `/dashboard/candidates` (drag-and-drop Kanban with 7 stages)
- `/dashboard/candidates/page.tsx` - Replace with content from `/candidates` but upgrade to use 7 stages: Identification, Attempted Outreach, Conversation, Candidate Presented, Interview, Accept, Rejected

## Steps

### Step 1: Create archive page
- Create directory: `turnkey-optimization/src/app/dashboard/candidates-archive/`
- Create file: `turnkey-optimization/src/app/dashboard/candidates-archive/page.tsx`
- Copy content from current `/dashboard/candidates/page.tsx` (drag-and-drop Kanban with 7 stages)

### Step 2: Update /dashboard/candidates
- Replace content in `turnkey-optimization/src/app/dashboard/candidates/page.tsx`
- Use content from `/candidates/page.tsx` as base
- Update pipeline stages to new 7 stages:
  - Identification
  - Attempted Outreach
  - Conversation
  - Candidate Presented
  - Interview
  - Accept
  - Rejected
- Keep the simpler list/pipeline view (no drag-and-drop needed based on user previous feedback)

### Step 3: Update links (if needed)
- Check for any links pointing to old routes and update if necessary

## New Pipeline Stages (7 stages)
```typescript
const pipelineStages = [
  { id: "identification", label: "IDENTIFICATION", color: "bg-blue-500" },
  { id: "attempted_outreach", label: "ATTEMPTED OUTREACH", color: "bg-purple-500" },
  { id: "conversation", label: "CONVERSATION", color: "bg-indigo-500" },
  { id: "candidate_presented", label: "CANDIDATE PRESENTED", color: "bg-teal-500" },
  { id: "interview", label: "INTERVIEW", color: "bg-amber-500" },
  { id: "accept", label: "ACCEPT", color: "bg-green-500" },
  { id: "rejected", label: "REJECTED", color: "bg-red-500" },
];
```

## Files to Edit
1. Create: `turnkey-optimization/src/app/dashboard/candidates-archive/page.tsx` (new file)
2. Edit: `turnkey-optimization/src/app/dashboard/candidates/page.tsx` (replace content)

## Status: Ready to Implement
