# Email Implementation TODO

## Task: Add bulk email + email tracking functionality

## Steps to Complete:

### Step 1: Install Required Packages
- [x] Install `resend` package
- [x] Install `@react-email/components` package
- [x] Verify `lucide-react` is already installed

### Step 2: Document Environment Variables
- [x] Add RESEND_API_KEY to env-template.txt
- [x] Add RESEND_FROM_EMAIL to env-template.txt

### Step 3: Create Email Logs Repository
- [x] Create `src/lib/db/repositories/email-log-repository.ts`
- [x] Add email_logs table configuration to db/dynamodb.ts

### Step 4: Create Email Email_Templates
- [x] Create `src/emails/RecruiterOutreach.tsx` - example outreach template

### Step 5: Create API Route for Bulk Email
- [x] Create `src/app/api/send-bulk/route.ts` - handles batch sending with Resend API

### Step 6: Create Email Server Actions
- [x] Create `src/lib/actions/email-actions.ts` - server actions for email operations

## Implementation Complete!

## Files Created/Modified:
- `package.json` - Added resend and @react-email/components
- `env-template.txt` - Added RESEND_API_KEY and RESEND_FROM_EMAIL
- `src/lib/db/dynamodb.ts` - Added emailLogsTable
- `src/lib/db/repositories/email-log-repository.ts` - NEW
- `src/emails/RecruiterOutreach.tsx` - NEW
- `src/app/api/send-bulk/route.ts` - NEW
- `src/lib/actions/email-actions.ts` - NEW

## Environment Variables Required (add to .env.local):
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=you@yourdomain.com
DYNAMODB_EMAIL_LOGS_TABLE=turnkey-email-logs
```

## Followup Steps:
- Set up DynamoDB email-logs table (key: id, range: tenant_id)
- Test the API route with sample data
- Use Resend dashboard to track email delivery
- Add email tracking UI to dashboard
