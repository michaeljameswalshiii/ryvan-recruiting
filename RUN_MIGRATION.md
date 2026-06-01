# RUN_MIGRATION.md

## Leads → Jobs Migration Guide

This document provides exact commands to migrate data from `turnkey-leads` to `turnkey-jobs`.

---

## Prerequisites

1. **AWS Credentials** - Ensure your AWS credentials are configured:
   ```bash
   aws configure
   # OR set environment variables AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
   ```

2. **Node.js & Dependencies** - Project should already have dependencies:
   ```bash
   cd turnkey-optimization
   npm install  # If not already installed
   ```

---

## Quick Start

### 1. Preview (Dry Run) - Recommended First

See what would be migrated without making any changes:

```bash
cd turnkey-optimization
npm run migrate:leads-to-jobs
# OR
npx tsx scripts/migrate-leads-to-jobs.ts
```

**Expected Output:**
```
============================================================
LEADS → JOBS MIGRATION
============================================================
Mode: DRY RUN (preview only)
...
This was a DRY RUN. No data was actually migrated.
```

### 2. Execute Migration - After Preview

When ready to actually migrate:

```bash
cd turnkey-optimization
npm run migrate:leads-to-jobs -- --execute
# OR
npx tsx scripts/migrate-leads-to-jobs.ts --execute
```

---

## Command Options

| Option | Description | Example |
|--------|------------|---------|
| (none) | Default dry-run mode | `tsx scripts/migrate-leads-to-jobs.ts` |
| `--execute` | Actually perform migration | `--execute` |
| `--dry-run` | Explicitly dry-run | `--dry-run` |
| `--verbose` | Show detailed output | `--verbose` |
| `--tenantId=<id>` | Migrate single tenant only | `--tenantId=abc123` |
| `--help` | Show help message | `--help` |

---

## Common Scenarios

### Using npm scripts (recommended)
```bash
# Dry run (preview)
npm run migrate:leads-to-jobs

# Dry run with verbose
npm run migrate:leads-to-jobs:verbose

# Using ts-node (if tsx not available)
npm run migrate:leads-to-jobs:tsnode -- --dry-run
```

### Using npx tsx directly

### Preview All Leads
```bash
npx tsx scripts/migrate-leads-to-jobs.ts
```

### Preview with Verbose Output
```bash
npx tsx scripts/migrate-leads-to-jobs.ts --verbose
```

### Migrate for Specific Tenant Only
```bash
npx tsx scripts/migrate-leads-to-jobs.ts --tenantId=your-tenant-id --execute
```

### Migrate All (Execute)
```bash
npx tsx scripts/migrate-leads-to-jobs.ts --execute
```

---

## Understanding the Migration

### What Gets Migrated

| Lead Field | Job Field | Notes |
|-----------|----------|-------|
| `name` | `title` | Used if no company/title |
| `company` | `companyName` | |
| `title` | `title` | Combined with company if both exist |
| `notes` | `description` | |
| `location` | `location` | |
| `status` | `status` | Mapped: new/identification → Open, rejected → Closed |

### Status Mapping

| Lead Status | Job Status |
|------------|----------|
| identification | Open |
| outreach | Open |
| conversation | Open |
| presented | Open |
| interview | Open |
| accept | Closed |
| rejected | Closed |
| converted | Closed |
| not_interested | Closed |
| on_hold | On Hold |

### Idempotency

The migration tracks migrated leads with a `migrated_from` field. Re-running the migration will skip leads that were already migrated.

---

## Safety Features

1. **Dry-Run Default** - Must explicitly pass `--execute` to actually migrate
2. **Idempotency** - Skips already-migrated leads
3. **Progress Output** - Shows each lead being processed
4. **Summary** - Shows counts at the end

---

## Alternative: Using ts-node

If you prefer using `ts-node` instead of `tsx`:

### 1. Install ts-node (one time)
```bash
npm install -D ts-node
```

### 2. Run Commands
```bash
# Dry run
npx ts-node scripts/migrate-leads-to-jobs.ts --dry-run

# Execute
npx ts-node scripts/migrate-leads-to-jobs.ts --execute

# With verbose
npx ts-node scripts/migrate-leads-to-jobs.ts --verbose
```

---

## Troubleshooting

### "Requested resource not found" error

The `turnkey-jobs` table doesn't exist. Create it first:

```bash
aws dynamodb create-table --cli-input-json file://create-jobs-table.json --region us-east-1
```

Or deploy CDK:

```bash
cd cdk
cdk deploy
```

### "Access Denied"

Check your AWS credentials have DynamoDB permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:Scan",
    "dynamodb:PutItem",
    "dynamodb:Query"
  ],
  "Resource": "arn:aws:dynamodb:us-east-1:*:table/turnkey-*"
}
```

### No leads found

The table might be empty or you might be scanning the wrong region. Check:

```bash
aws dynamodb scan --table-name turnkey-leads --limit 1 --region us-east-1
```

---

## Post-Migration

After successful migration:

1. **Verify Jobs** - Check `/dashboard/jobs` shows the migrated jobs
2. **Optional Cleanup** - Delete old leads table (after verifying migration):
   ```bash
   aws dynamodb delete-table --table-name turnkey-leads --region us-east-1
   ```

---

## Rollback

If something goes wrong:

1. Jobs are in `turnkey-jobs` table
2. Leads are still in `turnkey-leads` table (not deleted)
3. To remove migrated jobs:
   ```bash
   # List jobs with migrated_from field
   aws dynamodb scan --table-name turnkey-jobs --filter-expression "migrated_from <> :empty" --expression-attribute-values '{"M":{"S":""}}' --region us-east-1
   # Then delete individually (no bulk delete in DynamoDB)
   ```

---

**Last Updated**: June 3, 2026
