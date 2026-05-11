# Phase 3 AI Refactor - Complete Plan

## Current Status

### Already Done:
- ✅ TypeScript types in bedrock/route.ts
- ✅ Structured JSON logging  
- ✅ Better error handling
- ✅ Apollo API key required check

### Remaining Tasks:

## Task 1: Proper Tool Registry Pattern

### Create Tool Classes
- `src/lib/ai/tools/apollo.ts` - ApolloSearchTool class
- `src/lib/ai/tools/tavily.ts` - TavilySearchTool class
- `src/lib/ai/tools/internal.ts` - InternalDataTool (using repositories)

### Each Tool Class Should Have:
```typescript
class ApolloSearchTool {
  name = 'apollo';
  description = '...';
  
  async execute(params: ToolParams, context: ToolContext): Promise<ToolResult> {
    // Enforce tenant isolation
    // Make API call
    // Return typed result
  }
}
```

### Update lib/ai/tools/index.ts
- Import and use the new tool classes
- Remove inline functions

## Task 2: Modular Prompts

### Split bedrock-system.ts
- `src/lib/prompts/base.ts` - Base system prompt
- `src/lib/prompts/apollo.ts` - Apollo status/availability
- `src/lib/prompts/tools.ts` - Tool usage instructions
- `src/lib/prompts/override.ts` - Override instructions
- Combine in bedrock-system.ts

## Task 3: Strong Tenant Isolation

### Verify tenantId in all tools
- Every tool must validate tenantId before execution
- Reject requests without valid tenantId

### Add to middleware
- Ensure x-tenant-id header is set for /api/bedrock

## Task 4: Token Usage / Cost Tracking

### Add to logging:
```json
{
  "event": "bedrock-request",
  "tokens": { "prompt": 1200, "completion": 450 },
  "cost": 0.0015
}
```

### Estimate cost from model response
- Parse token counts if available

## Task 5: Structured Response Format

### Frontend-friendly response:
```json
{
  "success": true,
  "response": "Found 10 candidates...",
  "toolsUsed": ["apollo"],
  "toolResults": {
    "apollo": {
      "success": true,
      "count": 10,
      "data": [...]
    }
  },
  "metadata": {
    "latencyMs": 1250,
    "tokens": { "prompt": 1200, "completion": 450 },
    "tenantId": "abc123"
  }
}
```

## Implementation Order

1. Create tool classes (apollo.ts, tavily.ts, internal.ts)
2. Update tools/index.ts to use classes
3. Split prompts into modules
4. Add token/cost tracking to bedrock/route.ts
5. Update response format
6. Test and deploy
