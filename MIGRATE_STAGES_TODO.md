# Migration Script - One-Time Migration Plan

## Steps to Complete:

### Step 1: Create the new .mjs migration script
- Create `scripts/migrate-stages.mjs` with:
  - ESM imports (import ... from)
  - dotenv config for environment variables
  - Dry-run support via CLI argument (`--dry-run`)
  - Smaller batch size (25 vs 50) for safer processing
  - All functionality from existing migrate-stages.ts

### Step 2: Update package.json
- Add npm scripts:
  - "migrate:stages": "node scripts/migrate-stages.mjs"
  - "migrate:stages:dry": "node scripts/migrate-stages.mjs --dry-run"

### Step 3: Verify tsconfig.json
- Current tsconfig.json already excludes scripts: ["node_modules", "scripts", "*.js", "*.mjs"]
- No changes needed here

### Step 4: Clean environment (optional)
- Note: The tsconfig.json already properly excludes scripts, so rebuild should work cleanly
- @aws-sdk/lib-dynamodb is already in dependencies

## Implementation Status:
- [x] Step 1: Create migrate-stages.mjs
- [x] Step 2: Update package.json
- [x] Step 3: Verify tsconfig.json (already done)

## Summary of Changes:

### 1. Created `scripts/migrate-stages.mjs` ✓
- Converted TypeScript to ESM JavaScript (.mjs)
- Added dotenv config for loading environment variables
- Added dry-run support via CLI argument (`--dry-run`)
- Changed batch size from 50 to 25 for safer processing
- Added conditional logging ("Updated:" vs "Would update:")

### 2. Updated `package.json` ✓
- Added npm scripts:
  - "migrate:stages": "node scripts/migrate-stages.mjs"
  - "migrate:stages:dry": "node scripts/migrate-stages.mjs --dry-run"

### 3. Verified `tsconfig.json` ✓
- Already properly excludes scripts folder

## How to Use:

### Dry Run (test first):
```bash
npm run migrate:stages:dry
```

### Actual Migration:
```bash
npm run migrate:stages
```
