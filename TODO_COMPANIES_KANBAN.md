# Companies Page Kanban Implementation TODO

## Task
Update the companies page to match candidates page functionality:
- Add Kanban/pipeline columns with drag-and-drop
- Add Edit button (using CompanyEditModal)
- Add Delete button

## Status: COMPLETED

## Steps:

1. [x] Read current companies page code
2. [x] Read candidate page implementation for reference
3. [x] Update companies page with:
   - Add DnD imports (DndContext, useDroppable, SortableContext, etc.)
   - Add SortableCompanyCard component with Edit/Delete buttons
   - Add StageColumn component
   - Add companies grouped by stage
   - Add drag-and-drop handlers
4. [x] Fix CompanyEditModal to use company stages (8 stages)

## Implementation Details:
- Added useDeleteClient import from query-client.ts
- Added SortableCompanyCard with edit/delete buttons
- Added StageColumn component (droppable)
- Added DndContext with sensors and handlers
- 8 company pipeline stages from schema
- Companies grouped by status for Kanban columns

## Notes:
- CompanyEditModal uses correct 8 company stages (not candidate stages)
- uses useDeleteClient and useUpdateClientStatus from query-client.ts
- Company stages: identification, outreach, conversation, presented, meeting, proposal, closed_won, lost
