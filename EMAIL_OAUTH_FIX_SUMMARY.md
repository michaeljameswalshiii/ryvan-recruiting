# Email OAuth Fix - Missing Required Parameter: client_id

## Summary
Fixed the "Missing required parameter: client_id" error by adding proper validation for Gmail/Outlook OAuth credentials before attempting OAuth flows.

## Problem
When `GMAIL_CLIENT_ID` or `GMAIL_CLIENT_SECRET` environment variables were not set, the OAuth service would attempt to use `undefined` values in the OAuth initialization, resulting in a "Missing required parameter: client_id" error from Google's OAuth server.

## Files Modified

### 1. `src/lib/email/oauth-service.ts`
**Changes:**
- Added early return checks in `refreshOutlookToken()` and `exchangeGmailCode()` to verify credentials are configured before proceeding
- Added null coalescing fallback for `gmailRedirectUri` (empty string) when undefined
- Added null coalescing fallback for `outlookClientSecret` in refresh token params
- Added validation check in `getGmailClient()` before proceeding with token operations

**Code changes:**
```typescript
// Example: Added early validation
export async function refreshOutlookToken(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!outlookClientId || !outlookClientSecret) {
    return { success: false, error: 'Outlook OAuth not configured' };
  }
  // ... rest of function
}
```

### 2. `src/app/api/email/oauth/gmail/route.ts`
**Changes:**
- Added check for `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` before generating OAuth URL
- Returns 503 Service Unavailable with descriptive message if not configured
- Improved error message in catch block

**Code changes:**
```typescript
// Check if Gmail OAuth is configured before attempting
if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
  return NextResponse.json(
    { error: 'Gmail OAuth is not configured. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables.' },
    { status: 503 }
  );
}
```

### 3. `src/app/api/email/oauth/outlook/route.ts`
**Changes:**
- Added check for `OUTLOOK_CLIENT_ID` and `OUTLOOK_CLIENT_SECRET` before generating OAuth URL
- Returns 503 Service Unavailable with descriptive message if not configured
- Improved error message in catch block

### 4. `src/app/dashboard/settings/page.tsx`
**Changes:**
- Added client-side configuration check using API responses
- Added `gmailConfigured` and `outlookConfigured` state
- Added `checkOAuthConfig()` function to verify OAuth is available before showing connect buttons
- Shows toast error if user tries to connect when OAuth is not configured

**Code changes:**
```typescript
// Check if OAuth is configured
const checkOAuthConfig = async () => {
  try {
    const gmailResponse = await fetch('/api/email/oauth/gmail?userId=test', { method: 'HEAD' });
    const outlookResponse = await fetch('/api/email/oauth/outlook?userId=test', { method: 'HEAD' });
    
    setGmailConfigured(gmailResponse.status !== 503);
    setOutlookConfigured(outlookResponse.status !== 503);
  } catch (error) {
    setGmailConfigured(false);
    setOutlookConfigured(false);
  }
};

// Connect with validation
const connectGmail = () => {
  if (!gmailConfigured) {
    toast.error('Gmail OAuth is not configured. Please contact your administrator.');
    return;
  }
  window.location.href = `/api/email/oauth/gmail?userId=${userId}`;
};
```

## Error Handling Flow

1. **Backend (API Routes)**: 
   - Check env vars before generating OAuth URL
   - Return 503 if not configured with descriptive error

2. **OAuth Service**:
   - Validate credentials before any OAuth operations
   - Return proper error messages if not configured

3. **Frontend (Settings Page)**:
   - Check configuration on load
   - Disable connect buttons when not configured
   - Show appropriate error messages

## To Deploy

1. Set the environment variables in Vercel:
   - `GMAIL_CLIENT_ID`: Your Google OAuth client ID
   - `GMAIL_CLIENT_SECRET`: Your Google OAuth client secret
   - `OUTLOOK_CLIENT_ID`: Your Microsoft OAuth client ID
   - `OUTLOOK_CLIENT_SECRET`: Your Microsoft OAuth client secret
   - `GMAIL_REDIRECT_URI`: Your Gmail OAuth redirect URI (optional - defaults will be used)
   - `OUTLOOK_REDIRECT_URI`: Your Outlook OAuth redirect URI (optional - defaults will be used)

2. Deploy the updated code to Vercel

3. Test by visiting Settings > Email Connections

## Alternative: Without OAuth Configuration

If you don't want to configure OAuth, the code now gracefully handles the missing configuration:
- The "Connect Gmail" and "Connect Outlook" buttons will show "Not connected" status
- Clicking them will show a toast error: "Gmail/Outlook OAuth is not configured. Please contact your administrator."
- The rest of the application continues to work normally
