# TODO: AI Apollo Search Fixes

## Task
Apply three fixes to `src/app/dashboard/ai-apollo/page.tsx`:
1. Multi-line expandable search bar (Textarea)
2. Shift+Enter = new line, Enter = search
3. Search History (localStorage)

## Plan Status: ✅ COMPLETED

### Step 1: Add imports
- [x] Textarea from @/components/ui/textarea
- [x] Clock, Trash2 from lucide-react

### Step 2: Add search history state
- [x] Add searchHistory state
- [x] Add saveToHistory function
- [x] Add clearHistory function
- [x] Add useEffect for localStorage load

### Step 3: Replace Input with Textarea
- [x] People search tab
- [x] Companies search tab
- [x] Jobs search tab

### Step 4: Add keyboard handling
- [x] Handle Enter = search
- [x] Handle Shift+Enter = new line

### Step 5: Add Search History UI
- [x] Display recent searches
- [x] Add clear button
- [x] Make chips clickable

## Implementation Complete
All three fixes have been applied successfully:
- Multi-line Textarea with rows=4 and resize-y
- handleKeyDown function for keyboard handling
- Search history saved to localStorage and displayed as chips
