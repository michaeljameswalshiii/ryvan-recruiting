# Companies Page Update TODO

## Approach: Keep current Drag-and-Drop but replace stages with new 5 stages

### LONG TODO LIST (do them in order):

1. [x] Keep all existing imports at top
2. [ ] Replace old 8 stage tabs with new 5 stages:
   ```tsx
   const companyStages = [
     { id: "targeting", label: "Targeting", color: "bg-blue-500" },
     { id: "active", label: "Active Client", color: "bg-green-500" },
     { id: "onhold", label: "On Hold", color: "bg-yellow-500" },
     { id: "past", label: "Past Client", color: "bg-purple-500" },
     { id: "closed", label: "Closed", color: "bg-red-500" },
   ];
   ```
3. [ ] Add state for view mode: `const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");`
4. [ ] Add the List / Pipeline toggle buttons at the top (same style as Candidates page)
5. [ ] Add Pipeline Overview section with 5 cards showing counts for each stage
6. [ ] Keep the Search bar, Refresh button, and Add Company button
7. [ ] Create a simple List View (default) with a clean table
8. [ ] Create Pipeline View with 5 columns (keep DnD but use new stages)
9. [ ] Add "Move All Companies to Active Client" button using useUpdateClientStatus
10. [ ] Update any status mapping logic to work with the new 5 stages

## New 5 Stages to Use:
- targeting (Targeting) - bg-blue-500
- active (Active Client) - bg-green-500  
- onhold (On Hold) - bg-yellow-500
- past (Past Client) - bg-purple-500
- closed (Closed) - bg-red-500

## Start with Step 1 now.
