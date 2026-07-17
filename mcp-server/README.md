# Trio Recruiting MCP Server

Connect **Claude Desktop** or **Claude Code** to your Trio Recruiting ATS via [Model Context Protocol](https://modelcontextprotocol.io).

## First-slice tools

| Tool | Description |
|------|-------------|
| `search_candidates` | Search leads by name / email / phone / title / status / source |
| `get_candidate` | Full summary for one candidate id |
| `add_note` | Append an activity note (no stage change) |
| `list_jobs` | List jobs; optional status filter |

All reads/writes are scoped to **one tenant** from the process environment.

## Auth model

The MCP process is launched by Claude with env vars (not browser cookies):

| Variable | Required | Purpose |
|----------|----------|---------|
| `TRIO_MCP_API_KEY` | Yes | Shared secret (must match expected key) |
| `TRIO_MCP_EXPECTED_API_KEY` | Recommended | Server rejects wrong keys |
| `TRIO_TENANT_ID` | Yes* | DynamoDB `tenant_id` scope |
| `TRIO_MCP_API_KEYS` | Optional | Multi-tenant map `key1:tenant-a,key2:tenant-b` (overrides single tenant) |
| `AWS_REGION` | Yes | e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Yes* | Or use local AWS profile chain |
| `DYNAMODB_*_TABLE` | Optional | Defaults match the web app (`turnkey-leads`, etc.) |

\* Or use `TRIO_MCP_API_KEYS` instead of `TRIO_TENANT_ID`.

Generate a key, e.g.:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Install

```bash
cd mcp-server
npm install
```

Smoke-test (should exit 1 without env):

```bash
npm start
```

## Claude Desktop

1. Open Claude Desktop → Settings → Developer → Edit Config  
   (Windows: `%APPDATA%\Claude\claude_desktop_config.json`)
2. Merge the `mcpServers` block from `claude_desktop_config.example.json`.
3. **Fix the path** to this repo’s `mcp-server/src/index.ts`.
4. Set real `TRIO_*` and AWS values.
5. Fully quit and restart Claude Desktop.
6. Confirm tools appear under the MCP / tools indicator.

Example (Windows):

```json
{
  "mcpServers": {
    "trio-recruiting": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/Users/micha/turnkey-optimization/mcp-server/src/index.ts"
      ],
      "env": {
        "TRIO_MCP_API_KEY": "YOUR_SECRET",
        "TRIO_MCP_EXPECTED_API_KEY": "YOUR_SECRET",
        "TRIO_TENANT_ID": "tenant-2024-001",
        "AWS_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "AKIA...",
        "AWS_SECRET_ACCESS_KEY": "..."
      }
    }
  }
}
```

## Claude Code

Add the same server in Claude Code MCP settings (see `claude_code_mcp.example.json`), or project `.mcp.json` if your Claude Code version supports it.

## Example prompts in Claude

- “Search Trio for candidates named Mario”
- “Get candidate details for id `…`”
- “List Open jobs”
- “Add a note on candidate `…`: Spoke with hiring manager, interview next week”

## Security notes

- Treat `TRIO_MCP_API_KEY` like a password; do not commit it.
- Prefer IAM credentials limited to the leads/jobs/events tables.
- This first slice is **local stdio** only (your machine → AWS). Do not expose DynamoDB publicly.
- `add_note` writes to the events table only; it does not change pipeline stage.

## Next slices (not built yet)

- Stage updates / merge candidates  
- HTTP MCP transport for remote Claude  
- Per-user OAuth instead of static API keys  
- Contact / company tools  
