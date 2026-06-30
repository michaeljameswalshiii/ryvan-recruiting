# Pipeline Contact Integration Plan

## Overview
Add `clientId` reference to pipeline items so they pull contact info from the client's contacts array.

## Status: COMPLETED ✅

## Implementation Completed

### Step 1: Update Pipeline Schema ✅
- `clientId` field already exists in `src/lib/schemas/pipeline.ts`

### Step 2: Update Pipeline Repository ✅
- Already supports `clientId` in create/update operations

### Step 3: Update Pipeline Actions ✅
- Already extracts `clientId` from formData

### Step 4: Update Pipeline Hooks ✅
- Already has `usePipeline` and `useClients` hooks available

### Step 5: Update Pipeline Page UI ✅
- Added `clientId` to Lead interface
- Added client dropdown in Add Lead dialog
- Now passes `clientId` to formData when creating leads
- Added `getClientContactInfo` helper function
- Lead cards now display:
  - Client name when linked to a client
  - Contact email/phone from client's primary contact
  - Falls back to manual company/email/phone if no client linked

### Changes Made
**File:** `src/app/dashboard/pipeline/page.tsx`
- Added `clientId?: string` to Lead interface
- Include `clientId` in leads mapping from pipeline items
- Added `getClientContactInfo()` helper to fetch client contact data
- Pass `clientId` to formData when adding new lead
- Update lead card display to show client contact info when linked

## Followup Steps
1. Test adding a new lead with client selection
2. Verify contact info displays from client contacts
3. Consider migration of existing pipeline items (optional)
