# Sourcing Assistant Implementation Plan

## Information Gathered

### Current State
- AI Assistant at `/dashboard/ai-assistant` uses Bedrock + MiniMax for chat
- Has basic sourcing quick actions but no proper Apollo connection flow
- Apollo API key is server-side only (not user-connected)
- No structured candidate table display
- No enrichment or pipeline saving workflow

### Target State
- Turn the AI Assistant into a **Sourcing Assistant** persona
- Should check if user has connected their Apollo account
- Only show contact info when Apollo is connected
- Implement full workflow: Search → Table → Enrich → Save to Pipeline

## Plan

### File Changes

1. **`src/app/dashboard/ai-assistant/page.tsx`** - Major update
   - Update welcome message to: "✅ Sourcing Assistant ready. Who or what would you like to source today?"
   - Add Apollo connection status indicator
   - Add proper sourcing workflow UI with table display
   - Add enrichment confirmation dialog
   - Add "Save to Pipeline" button functionality
   - Update system prompt for the sourcing persona

2. **`src/app/api/bedrock/route.ts`** - Minor update
   - Update system prompt to reflect new Sourcing Assistant persona
   - Add better handling for Apollo-enriched results

3. **Add new components** (optional):
   - May need a table component for candidate display
   - Confirmation dialog for enrichment

## Progress

- [x] Step 1: Update ai-assistant/page.tsx with new Sourcing Assistant persona
- [x] Step 2: Update api/bedrock/route.ts with new system prompt
- [ ] Step 3: Test the updated AI Assistant with sourcing queries

## Followup Steps
- Test the updated AI Assistant with sourcing queries
- Verify Apollo API integration works properly
