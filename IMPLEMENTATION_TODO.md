# Bedrock Usage Tracking Implementation

## Status: Complete

## Files Created/Modified

### New Files Created:
1. `src/lib/db/usage.ts` - Usage repository (may have duplicates, needs cleanup)
2. `src/app/dashboard/usage/page.tsx` - Usage dashboard UI
3. `src/app/api/usage/route.ts` - API route to log usage

### Modified Files:
1. `src/lib/db/dynamodb.ts` - Added bedrockUsageTable
2. `src/lib/db/index.ts` - Added usage re-export
3. `src/components/dashboard/nav.tsx` - Added AI Usage nav link
4. `src/lib/aws/athena-bedrock.ts` - Already has all functions

## Optional Cleanup

The `src/lib/db/usage.ts` has some duplicate definitions. The athena-bedrock.ts already handles all the tracking. You can either:
- Delete `src/lib/db/usage.ts` 
- Or remove duplicates from it

## Usage

### Logging Usage (from any AI client)
```typescript
// After each AI call, call:
await fetch('/api/usage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    modelId: 'global.anthropic.claude-sonnet-4-6',
    inputTokens: 500,
    outputTokens: 200,
    queryPreview: 'Find Python developers...',
    latencyMs: 1500,
  })
});
```

### Viewing Dashboard
Navigate to `/dashboard/usage` or click "AI Usage" in the sidebar

## Environment Variables

Optional - for DynamoDB table name:
```
DYNAMODB_BEDROCK_USAGE_TABLE=turnkey-bedrock-usage
```

If not set, defaults to `turnkey-bedrock-usage`
