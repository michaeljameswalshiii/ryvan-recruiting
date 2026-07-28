# Trio SMS setup (AWS End User Messaging)

This guide wires **live texting** into Trio using **AWS End User Messaging SMS** (formerly Pinpoint SMS). The product UI and compliance flow are already in the app.

## What Trio already does for you

| Feature | Where |
|--------|--------|
| Enable texting, business name, STOP signature | **Settings → Texting** |
| Quiet hours, daily limits, require consent | Same |
| Record opt-in / opt-out | Candidate → **Text candidate** panel |
| Send SMS + thread log | Candidate panel |
| STOP / START / HELP auto-replies | Webhook `/api/public/sms/inbound` |
| Simulated mode (no AWS number yet) | Messages log with status `simulated` |

## Prerequisites

- AWS account (same one as Dynamo/Cognito is fine)
- IAM user/role Trio already uses needs SMS permissions (below)
- US production volume: **10DLC brand + campaign registration**

---

## Step 1 — IAM permissions

Attach to the credentials used by Vercel / Trio:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sms-voice:SendTextMessage",
        "sms-voice:DescribePhoneNumbers",
        "sms-voice:DescribeOptedOutNumbers",
        "sms-voice:CreateConfigurationSet",
        "sms-voice:DescribeConfigurationSets"
      ],
      "Resource": "*"
    }
  ]
}
```

(API namespace is End User Messaging SMS / Pinpoint SMS Voice v2.)

---

## Step 2 — Request a number in AWS

1. Open AWS Console → **AWS End User Messaging** → **SMS**.
2. Complete **account sandbox** exit if you need to text real numbers outside verified list.
3. **Phone numbers** → request a **US 10DLC** (or toll-free) number.
4. Complete **brand** and **campaign** registration (can take days).
5. Copy the number in E.164 form, e.g. `+15551234567`.

---

## Step 3 — Environment variables (Vercel)

| Variable | Required | Purpose |
|----------|----------|---------|
| `AWS_ACCESS_KEY_ID` | Yes | Already used by Trio |
| `AWS_SECRET_ACCESS_KEY` | Yes | Already used by Trio |
| `AWS_REGION` | Yes | e.g. `us-east-1` (number region) |
| `AWS_SMS_ORIGINATION_NUMBER` | Recommended | Default from number `+1…` |
| `SMS_WEBHOOK_SECRET` | Recommended | Shared secret for inbound webhook |
| `SMS_DEFAULT_TENANT_ID` | Optional | If webhook cannot pass tenantId |
| `SMS_PROVIDER` | Optional | `simulated` to force dry-run; `off` to disable |

You can also set origination only in **Settings → Texting** (stored per tenant).

---

## Step 4 — Enable in the app

1. Log into Trio → **Settings** → **Texting** tab.
2. Check **Enable texting**.
3. Set **Business / agency name** (shows on first messages).
4. Paste **Origination number** if not using env.
5. Leave **Require recorded consent** ON for safer recruiting use.
6. Save.

Until AWS is fully live, sends still work in **simulated** mode (logged in the thread, not delivered).

---

## Step 5 — First real candidate text

1. Open a candidate with a US phone.
2. Expand **Text candidate**.
3. Click **Record opt-in** (or check “Also mark opt-in when sending” if appropriate).
4. Type a short message → **Send text**.
5. Confirm delivery on the phone when AWS is out of sandbox.

---

## Step 6 — Inbound STOP/START (two-way)

Point AWS event destination / SNS → HTTPS:

```
POST https://<your-domain>/api/public/sms/inbound
Header: x-sms-webhook-secret: <SMS_WEBHOOK_SECRET>
Body example:
{
  "tenantId": "tenant-…",
  "from": "+15559876543",
  "body": "STOP",
  "messageId": "…"
}
```

Supported keywords:

| Keyword | Effect |
|---------|--------|
| STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT | Opt-out + confirmation SMS |
| START, YES, UNSTOP | Opt-in again |
| HELP, INFO | Help auto-reply |

---

## Compliance defaults (product policy)

- Consent required before first outbound (configurable).
- Cold outreach off by default.
- STOP notice appended when enabled.
- Quiet hours 21:00–08:00 workspace timezone.
- Daily cap (default 200) per tenant.
- Opted-out numbers hard-blocked.

**This is software enforcement, not legal advice.** Confirm TCPA / carrier rules with counsel for marketing vs transactional recruiting messages.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Texting is disabled” | Settings → enable |
| “Consent required” | Record opt-in on candidate |
| “Quiet hours” | Wait, or bypass for urgent only |
| “No origination number” | Set number in Settings or `AWS_SMS_ORIGINATION_NUMBER` |
| Status `simulated` | Credentials missing or `SMS_PROVIDER=simulated`, or number not set while in sim mode |
| AWS error about sandbox | Verify destination numbers or exit sandbox |
| 10DLC rejected | Fix brand/campaign registration in AWS console |

---

## Optional next integrations

- Sequence channel `sms` (schema ready; runner can call `sendSmsToCandidate`)
- Schedule link reminders over SMS
- Per-tenant phone pools for multi-brand agencies
