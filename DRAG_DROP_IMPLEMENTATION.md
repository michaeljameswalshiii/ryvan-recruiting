# Drag & Drop Implementation Plan

## Task: Add drag-and-drop functionality so users can move candidates forward and backward between stages

### Information Gathered:
- @dnd-kit already installed in package.json
- Server actions already have `updateLeadStatus()` function that updates DynamoDB AND records STATUS_CHANGE event
- Query hooks already have `useUpdateLeadStatus()` mutation hook
- Current stages: New → Contacted → Qualified → Interested → Converted → Not Interested
- New stages required: Applied → Screening → Interview → Offer → Hired → Rejected

### Plan:
1. **Update candidates page** (`src/app/dashboard/candidates/page.tsx`):
   - Import @dnd-kit components (DndContext, useSensors, useSensor, PointerSensor, etc.)
   - Import @dnd-kit/sortable components (SortableContext, useSortable, verticalListSortingStrategy)
   - Import @dnd-kit/modifiers for smooth animations
   - Replace pipelineStages array with new configurable stages: Applied → Screening → Interview → Offer → Hired → Rejected
   - Wrap columns in DndContext with drag end handler
   - Wrap candidate cards in useSortable
   - Add dragging state styles and animations
   - Add status badge to candidate cards
   - Add drop target highlighting visualization

2. **Add animations and visual feedback**:
   - Use @dnd-kit's built-in modifiers (snapCenterToCursor)
   - Add opacity/scale transformations during drag
   - Add smooth enter/exit animations
   - Add drop placeholder animation

3. **Add status badge** to candidate card showing current status

### Implementation Steps:
1. Import dnd-kit components
2. Create configurable stages array at top of file
3. Wrap pipeline in DndContext with sensors and handlers
4. Make columns into Droppable sortable containers
5. Make candidate cards into Sortable items
6. Update moveToStage to use useUpdateLeadStatus hook
7. Add status badge display
8. Add visual feedback (drag overlay, drop target styles)
