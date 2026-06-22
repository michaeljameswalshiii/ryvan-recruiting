# Contacts Simple Implementation TODO

## Task: Revert to minimal old-style contacts page that works without authentication

### Steps Completed:
1. [x] Analyze current codebase structure
2. [x] Identify files that need changes
3. [x] Update src/app/dashboard/contacts/page.tsx - Simplified display to show only name
4. [x] Update src/app/dashboard/contacts/[contactId]/page.tsx - Changed to use "default-tenant"

### Changes Made:
- page.tsx: Now uses "default-tenant", displays only client.name
- [contactId]/page.tsx: Changed from getSessionTenantId() to hardcoded "default-tenant"

### Testing:
- Test by building/deploying the app
- Both list and detail pages should work without authentication
