# AI Apollo - Add to Candidates Feature Guide

This document shows how to use the "Add to Candidates" functionality from AI search results.

---

## Features Implemented

### 1. Core Import Function (`src/lib/candidates/import.ts`)

```typescript
import { importResultAsCandidate, AIRawResult } from '@/lib/candidates/import';

// Single import
const result = await importResultAsCandidate(
  rawResult,           // Data from AI search
  'apollo',          // Source name
  'Python developer Miami'  // Optional search query
);

// Bulk import
import { bulkImportCandidates } from '@/lib/candidates/import';

const bulkResult = await bulkImportCandidates(
  results,           // Array of AIRawResult
  'apollo',
  'search query'
);
// Returns: { imported, duplicates, errors, candidateIds }
```

### 2. API Endpoint (`/api/import-candidate`)

```typescript
// POST /api/import-candidate
const response = await fetch('/api/import-candidate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rawResult: {
      name: 'John Doe',
      email: 'john@company.com',
      title: 'Software Engineer',
      company: 'Tech Corp',
      linkedin_url: 'https://linkedin.com/in/johndoe'
    },
    source: 'apollo',
    searchQuery: 'Python developer Miami'
  })
});

const data = await response.json();
// { success: true, candidateId: 'uuid', isNew: true, message: '...' }
```

---

## UI Components

### 1. Save Button Component

```typescript
import { SaveCandidateButton } from '@/components/candidate-import';

<SaveCandidateButton
  result={person}
  source="apollo"
  searchQuery="Python developer Miami"
  onSuccess={(candidateId) => {
    console.log('Saved:', candidateId);
    // Optionally navigate to candidate detail page
    router.push(`/candidates/${candidateId}`);
  }}
  variant="default"        // default | outline | ghost | secondary
  size="sm"              // default | sm | lg | icon
  showLabel={true}       // Show "Add to Candidates" label
/>
```

### 2. Result Card with Import Button

```typescript
import { AIResultCard } from '@/components/candidate-import';

<AIResultCard
  result={person}
  source="apollo"
  searchQuery="Python developer Miami"
  onSelect={(selected) => setSelected(selected)}
/>
```

### 3. Bulk Import Button

```typescript
import { BulkSaveButton } from '@/components/candidate-import';

const [selected, setSelected] = useState<AIRawResult[]>([]);

<BulkSaveButton
  results={selected}
  source="apollo"
  searchQuery="Python developer Miami"
  onComplete={(results) => {
    console.log(`Imported: ${results.imported}`);
  }}
/>
```

---

## Database Schema

Candidates are stored in DynamoDB with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| tenant_id | string | Multi-tenant isolation |
| name | string | Candidate full name |
| email | string | Email address |
| phone | string | Phone number |
| company | string | Company name |
| title | string | Job title |
| status | string | Pipeline status |
| source | string | Import source |
| linkedin_url | string | LinkedIn profile |
| notes | string | Notes |
| created_at | ISO date | Creation timestamp |

---

## Duplicate Detection

The system checks for duplicates by:
1. **Email** - Exact match on email address
2. **LinkedIn URL** - Approximate match

If duplicates found:
```json
{
  "success": false,
  "isDuplicate": true,
  "duplicateOf": "existing-candidate-id",
  "message": "This candidate already exists in your pipeline"
}
```

---

## Activity Tracking

Events are recorded in DynamoDB with the `CANDIDATE_IMPORTED` event type:

```typescript
// Automatically recorded in importResultAsCandidate
await recordCandidateImported(
  candidateId,
  'apollo',           // Source
  userEmail,
  0.85,             // AI confidence score (0-1)
  rawData,             // Original raw data
  searchQuery         // Search query used
);
```

---

## Example: Complete AI Search Result Page

```typescript
"use client";

import { useState } from "react";
import { AIResultCard, SaveCandidateButton } from "@/components/candidate-import";
import { toast } from "sonner";

export default function AISearchPage() {
  const [results, setResults] = useState<AIRawResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = async () => {
    const res = await fetch("/api/apollo/search", {
      method: "POST",
      body: JSON.stringify({ q: searchQuery })
    });
    const data = await res.json();
    setResults(data.people || []);
  };

  return (
    <div className="p-4">
      <input 
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search candidates..."
      />
      <button onClick={handleSearch}>Search</button>

      <div className="grid gap-4 mt-4">
        {results.map((person) => (
          <AIResultCard
            key={person.id}
            result={person}
            source="apollo"
            searchQuery={searchQuery}
            onSuccess={(candidateId) => {
              toast.success("Candidate added!");
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Files Changed/Added

1. `src/lib/candidates/import.ts` - Core import logic (already existed)
2. `src/lib/db/repositories/lead-repository.ts` - Added duplicate detection (already existed)
3. `src/app/api/import-candidate/route.ts` - API endpoint (already existed)
4. `src/components/candidate-import/save-button.tsx` - Button component (already existed)
5. `src/components/candidate-import/result-card.tsx` - Result card (already existed)
6. `src/components/candidate-import/index.ts` - Exports (already existed)
7. `src/lib/events/candidate-events.ts` - Event tracking (already existed)

---

## Deployment

The feature is deployed to:
- Production: https://turnkey-optimization.vercel.app
