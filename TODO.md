# DynamoDB Viewer Editable Enhancement Plan

## Information Gathered

### Current Implementation:
1. **API Route** (`src/app/api/admin/dynamodb/route.ts`):
   - GET endpoint for listing tables and scanning items
   - PATCH endpoint for updating items with update expressions

2. **Database Module** (`src/lib/db/dynamodb.ts`):
   - `updateItem()` function that builds DynamoDB UpdateItem commands
   - `getKeyFields()` helper to determine key fields per table

3. **Page Component** (`src/app/admin/dynamodb/page.tsx`):
   - Edit state management with `EditState` interface
   - `handleStartEdit`, `handleCancelEdit`, `handleSaveEdit` functions
   - Input field for editing cells
   - Save/Cancel buttons in actions column
   - PATCH API call to persist changes

### Current Issues:
1. Can only edit the first column (hardcoded to `columns[0].key`)
2. No visual feedback that cells are editable (cursor, hover effect)
3. No double-click or click-to-edit on cells

## Plan

### Step 1: Make cells directly editable
- Add click handler on cells to start editing
- Show edit mode when clicking on any editable cell
- Track which column is being edited per row

### Step 2: Add visual feedback for editable cells
- Cursor pointer on cells when in view mode
- Hover effect to indicate interactivity
- Different background for editing mode

### Step 3: Improve UX
- Add double-click to edit functionality
- Keep existing pencil button for explicit edit
- Ensure keyboard navigation works

## Dependent Files to Edit
- `turnkey-optimization/src/app/admin/dynamodb/page.tsx` - Main edits

## Followup Steps
- Test the editable functionality
- Verify PATCH API works correctly
- Test with different DynamoDB tables
