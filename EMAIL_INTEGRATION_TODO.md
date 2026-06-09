# Email Integration Implementation TODO

## Status: IN PROGRESS

## Goal
Implement Email Integration (Gmail + Outlook) so users can send/receive emails from their real address with everything tracked in the ATS.

## Budget
AWS-only (no Nylas, no recurring per-user fees)

## MVP Acceptance Criteria
- [x] User can connect Gmail or Outlook via OAuth
- [x] User can compose + send email from a candidate profile (appears from their real email address)
- [ ] Replies (and incoming emails) are automatically pulled into the candidate timeline
- [x] No per-user monthly fees

## Implementation Plan

### Phase 1: Backend Foundation

#### 1.1 DynamoDB Table: UserEmailConnections
- [x] Created via repository
- [ ] Encrypt refresh tokens with AWS KMS (optional enhancement)

#### 1.2 Lambda Functions
- [x] OAuthCallback - handles Google/Azure redirect and saves tokens
- [x] SendEmail - takes data → sends via user's connected account
- [ ] HandleEmailWebhook - processes incoming email notifications
- [ ] RefreshTokens - scheduled to keep tokens fresh

### Phase 2: OAuth Setup

#### 2.1 Gmail OAuth
- [ ] Create Google Cloud project + OAuth consent screen
- [ ] Configure scopes: gmail.send, gmail.modify, gmail.readonly
- [x] Integration code ready (googleapis)

#### 2.2 Outlook OAuth (Phase 2)
- [ ] Azure App Registration
- [ ] API permissions: Mail.ReadWrite, Mail.Send, offline_access
- [x] Integration code ready (@microsoft/microsoft-graph-client)

### Phase 3: Send Email Feature

#### 3.1 SendEmail API
- [x] /api/email/send endpoint ready
- [x] Use googleapis for Gmail sending
- [x] Use @microsoft/microsoft-graph-client for Outlook
- [x] Handle threading headers

### Phase 4: Receiving & Timeline Sync

#### 4.1 Gmail Webhooks
- [ ] Set up Google Pub/Sub push notifications
- [ ] Process incoming emails
- [ ] Match to candidate by email

#### 4.2 Outlook Webhooks
- [ ] Microsoft Graph Change Notifications
- [ ] Process incoming emails

### Phase 5: Frontend

#### 5.1 User Settings
- [ ] "Connect Gmail" button
- [ ] "Connect Outlook" button
- [ ] Connected status display
- [ ] Disconnect button

#### 5.2 Candidate Profile
- [ ] Email composer modal
- [ ] Timeline includes email activities

## Technical Details

### Tech Stack
- Node.js on Lambda
- googleapis npm package
- @microsoft/microsoft-graph-client
- AWS SDK v3 (DynamoDB, KMS, Lambda)
- Vercel frontend

### Security
- Encrypt refresh tokens with AWS KMS
- Never log tokens
- Use HTTPS for all callbacks

## Timeline
- Week 1: OAuth + Token storage + Send Email (Gmail)
- Week 2: Webhook setup + Timeline display (Gmail)
- Week 3: Outlook + polish + testing

## Completed
- [x] Reviewed existing email codebase
- [x] Understood current Gmail SMTP implementation
- [x] Created schema (email-connection.ts)
- [x] Created repository (email-connection-repository.ts)
- [x] Created OAuth service (oauth-service.ts) - Gmail + Outlook OAuth
- [x] Created send email service (send-email-service.ts)
- [x] Created API routes:
  -     GET /api/email/oauth/gmail
  -     GET /api/email/oauth/gmail/callback
  -     GET /api/email/oauth/outlook
  -     GET /api/email/oauth/outlook/callback
  -     GET /api/email/connections
  -     DELETE /api/email/connections/:provider
  -     POST /api/email/send
- [x] Created Settings page with email connections UI
