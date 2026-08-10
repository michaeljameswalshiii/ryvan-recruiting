# Immediate UI updates (CRM)

All product mutations should make the screen feel instant. Do **not** rely only on `router.refresh()` or multi-minute server caches.

## Rules

1. **Update local UI first**  
   - React Query: `setQueryData` / `onMutate` optimistic update  
   - Detail screens: `useState` for fields the user just changed  

2. **Persist to the API**  

3. **On success**  
   - Prefer server payload into cache when available  
   - Call `refreshCrmUi(queryClient, […keys])` from `@/lib/hooks/immediate-ui`  
   - Optionally `router.refresh()` for server components  

4. **On error**  
   - Roll back optimistic data  
   - Toast the failure  

5. **Server repositories (leads, jobs, contacts, pipeline)**  
   - **No multi-minute in-memory cache** for entity lists or detail reads  
   - Always read DynamoDB after writes so warm serverless instances never serve stale links/stages  

## Helpers

```ts
import { refreshCrmUi, optimisticSet, rollbackOptimistic } from "@/lib/hooks/immediate-ui";

// After any CRM write:
await refreshCrmUi(queryClient, [leadKeys.all, jobKeys.all]);
```

## Anti-patterns

- Waiting only for `router.refresh()` before removing a card  
- Caching `getLeadById` / `getJobById` for minutes in process memory  
- `staleTime: 30_000` without invalidating after mutations  

## Checklist for new features

- [ ] Mutation updates list/detail in the same tick (optimistic or setQueryData)  
- [ ] `refreshCrmUi` (or equivalent invalidate) runs on success  
- [ ] Failed mutation restores previous UI  
- [ ] Server path does not re-serve pre-mutation cached CRM rows  
