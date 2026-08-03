# Ops scripts

Local/admin tooling lives here — **not** in the Vercel deploy (see `.vercelignore`).

## Rules

1. **Never hardcode secrets.** Read from environment variables only.
2. **Never commit** `.env*`, Dynamo dumps, Cognito client configs, or API keys.
3. Prefer dry-run flags for anything that mutates production data.
4. If a script is one-off debugging, delete it when done — do not leave it at the repo root.

## Safe layout

| Path | Purpose |
|------|---------|
| `scripts/setup-dynamodb*.ps1` | Table setup (dev) |
| `scripts/*.mjs` / `*.ts` | One-off migrations / backfills |

Root-level `check-*.js`, `delete-user.js`, `add-*-creds.ps1`, etc. were removed in the hygiene pass. Recreate privately if needed; do not restore them to a public tree.
