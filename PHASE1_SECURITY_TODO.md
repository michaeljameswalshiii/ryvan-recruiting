# Phase 1 Security Fixes - TODO List

## Tasks
- [x] 1. Verify middleware.ts production security (no bypasses)
- [x] 2. Fix register flow: proper userId from Cognito (not email fallback)
- [x] 3. Add token refresh logic to session validation
- [ ] 4. Test full auth flow (login → dashboard → logout)

## Completed Fixes (May 10, 2026)

### 1. server-auth.ts - Register Flow (Issue #4)
- ✅ Removed email fallback for userId
- ✅ Now throws error if Cognito doesn't return UserSub
- ✅ Prevents security issue where email becomes user ID

### 2. middleware.ts - Token Refresh (Issue #6)
- ✅ Added token refresh logic on expiration
- ✅ validateSessionToken now accepts optional refreshToken
- ✅ Automatically tries to refresh expired tokens
- ✅ Dashboard route passes refreshToken for auto-refresh

## Already Fixed (From Previous Session)
- ✅ Issue #2: Env vars correctly use server-side only (NOT NEXT_PUBLIC_*)
- ✅ Issue #3: Cookie helpers already exist (setSessionCookie, clearSessionCookie)
- ✅ Issue #5: Using GetUserCommand (reliable, simple)

## Files Modified
- src/lib/server-auth.ts
- src/middleware.ts

## Testing Required
Run: npm run dev and test:
1. Register new user → should NOT use email as userId
2. Login → dashboard → should work
3. Logout → should clear session
4. Token expiration → should auto-refresh (if refresh token available)
