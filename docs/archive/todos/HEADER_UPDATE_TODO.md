yes# Header Update TODO

## Task
Replace the header section (top part with title + buttons + toggle) in 3 pages with a unified consistent layout:
- Title on left
- Toggle centered (on large screens)
- Buttons on right
- On mobile: all stacked vertically

## Files to Edit

### 1. candidates/page.tsx
- **Current:** Lines 148-182 (header + toggle are separate)
- **Replaced with:** Unified header with toggle in middle
- **Notes:** Uses `handleRefresh`, `viewMode` state already exists

### 2. companies/page.tsx  
- **Current:** Lines 60-111 (header + toggle are separate)
- **Replaced with:** Unified header with toggle in middle
- **Notes:** Uses `viewMode` state, no handleRefresh function currently

### 3. jobs/page.tsx
- **Current:** Lines ~145-185 (header + toggle are separate)
- **Replaced with:** Unified header with toggle in middle
- **Notes:** Uses `handleRefresh`, `viewMode`, `isAddDialogOpen` state - need to update carefully

## Implementation Steps

1. [x] Read all 3 files (DONE)
2. [x] Edit candidates/page.tsx - Replace header section (DONE)
3. [x] Edit companies/page.tsx - Replace header section (DONE)
4. [x] Edit jobs/page.tsx - Replace header section (DONE)
5. [x] Verify changes (COMPLETE)

## New Header Structure

```jsx
{/* HEADER - TITLE + TOGGLE + BUTTONS ON SAME LINE */}
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
  <div>
    <h1 className="text-3xl font-bold">Title</h1>
    <p className="text-muted-foreground">Subtitle</p>
  </div>

  {/* Toggle in the middle */}
  <div className="flex justify-center lg:justify-start">
    <div className="inline-flex bg-muted rounded-lg p-1">
      <Button variant={viewMode === "list" ? "default" : "ghost"} onClick={() => setViewMode("list")} className="px-8">
        List
      </Button>
      <Button variant={viewMode === "pipeline" ? "default" : "ghost"} onClick={() => setViewMode("pipeline")} className="px-8">
        Pipeline
      </Button>
    </div>
  </div>

  {/* Action Buttons */}
  <div className="flex items-center gap-3">
    <Button variant="outline" onClick={handleRefresh}>
      <RefreshCw className="h-4 w-4 mr-2" />
      Refresh
    </Button>
    <Button>Add...</Button>
  </div>
</div>
