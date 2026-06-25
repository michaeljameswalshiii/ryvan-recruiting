# Contacts Page Fix - TODO

## Problem
The contacts page is calling `getAllClients()` directly from a client component, but DynamoDB client is server-side only.

## Solution
Refactor to use TanStack Query hooks (like the jobs page does).

## Steps

- [ ] 1. Read current contacts page structure
- [ ] 2. Modify to use `useClients` hook from `@/lib/hooks/query-client`
- [ ] 3. Test the fix
