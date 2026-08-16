# Turnkey SMS setup (AWS End User Messaging)

This guide wires **live texting** into Turnkey using **AWS End User Messaging SMS** (formerly Pinpoint SMS). The product UI and compliance flow are already in the app.

## What Turnkey already does for you

| Feature | Where |
|--------|--------|
| Enable texting, business name, STOP signature | **Settings → Texting** |
| Quiet hours, daily limits, require consent | Same |
| Record opt-in / opt-out | Candidate → **Text candidate**; Contact → **Text contact** |
| Send SMS + thread log | Candidate panel + Contact detail panel |
| Route replies to the assigned user | **Texting inbox / My texts** |
| Company-wide and unassigned queues | Company Admin **Texting inbox** |
| STOP / START / HELP auto-replies | Webhook `/api/public/sms/inbound` |
| Simulated mode (no AWS number yet) | Messages log with status `simulated` |

## Prerequisites

- AWS account (same one as Dynamo/Cognito is fine)
- IAM user/role Turnkey already uses needs SMS permissions (below)
- US production volume: **10DLC brand + campaign registration**

---

## Step 1 — IAM permissions

Attach to the credentials used by Vercel / Turnkey:

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
| `AWS_ACCESS_KEY_ID` | Yes | Already used by Turnkey |
| `AWS_SECRET_ACCESS_KEY` | Yes | Already used by Turnkey |
| `AWS_REGION` | Yes | e.g. `us-east-1` (number region) |
| `AWS_SMS_ORIGINATION_IDENTITY` | Recommended | Default phone number or origination ARN (`AWS_SMS_ORIGINATION_NUMBER` is also accepted) |
| `AWS_SMS_CONFIGURATION_SET_NAME` | Yes for delivery events | Configuration set used for outbound sends |
| `AWS_SMS_INBOUND_TOPIC_ARN` | Yes for replies | Expected SNS topic; prevents cross-topic notifications |
| `SMS_DEFAULT_TENANT_ID` | Optional | If webhook cannot pass tenantId |
| `SMS_PROVIDER` | Optional | `simulated` to force dry-run; `off` to disable |

You can also set origination only in **Settings → Texting** (stored per tenant).

---

## Step 4 — Enable in the app

1. Log into Turnkey → **Settings** → **Texting** tab.
2. Check **Enable texting**.
3. Set **Business / agency name** (shows on first messages).
4. Paste **Origination number** if not using env.
5. Leave **Require recorded consent** ON for safer recruiting use.
6. Save.

Until AWS is fully live, sends still work in **simulated** mode (logged in the thread, not delivered).

---

## Step 5 — First real candidate or contact text

1. Open a **candidate** or **contact** with a US phone.
2. Expand **Text candidate** / **Text contact**.
3. Click **Record opt-in** (or check “Also mark opt-in when sending” if appropriate).
4. Type a short message → **Send text**.
5. Confirm delivery on the phone when AWS is out of sandbox.

Contacts use the same consent/compliance rules as candidates. Phone preference for contacts: mobile/cell first, then work/preferred.

## Conversation routing

- Assign one AWS origination number to each company tenant. Five company users share that one number rather than purchasing five numbers.
- The first outbound text assigns the conversation to the candidate/contact owner. Assignment priority is owner, recruiter, account manager, then collaborator; the sender is the fallback.
- AWS's prior-message identifier routes a reply back to the same conversation. The company-number plus candidate-number pair is the fallback.
- Standard users can access only **My texts**. Company Admins can access **My texts**, **All company**, and **Unassigned**, and can reassign a thread.
- An inbound message that cannot be matched safely is placed in **Unassigned**. It is never exposed to every standard user.
- Routing is inside Turnkey's responsive inbox. It does not forward candidate messages to employees' personal phone numbers.

---

## Step 6 — Inbound STOP/START (two-way)

Subscribe the SNS topic to the production HTTPS endpoint:

```
POST https://<your-domain>/api/public/sms/inbound
```

Turnkey verifies the Amazon SNS certificate and message signature, checks the
topic ARN, confirms the subscription, and unwraps the AWS inbound SMS payload.
The destination number is matched to the tenant's Texting settings; use
`SMS_DEFAULT_TENANT_ID` only as a fallback for a shared platform number.

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
| “No origination number” | Set number in Settings or `AWS_SMS_ORIGINATION_IDENTITY` |
| Status `simulated` | Credentials missing or `SMS_PROVIDER=simulated`, or number not set while in sim mode |
| AWS error about sandbox | Verify destination numbers or exit sandbox |
| 10DLC rejected | Fix brand/campaign registration in AWS console |

---

## Optional next integrations

- Sequence channel `sms` (schema ready; runner can call `sendSmsToCandidate`)
- Schedule link reminders over SMS
- Per-tenant phone pools for multi-brand agencies
