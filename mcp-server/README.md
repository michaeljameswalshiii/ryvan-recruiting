# Trio Recruiting MCP Server

Connect **Claude Desktop** or **Claude Code** to Trio via [MCP](https://modelcontextprotocol.io).

## Recommended: keys from the web app (no AWS on the laptop)

1. Sign in to Trio as a **customer admin**
2. **Settings → Integrations**
3. **Create API key** — copy the key + ready-made Claude config
4. Install this folder once: `cd mcp-server && npm install`
5. Paste config into Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)
6. Set the local path to `mcp-server/src/index.ts` and restart Claude

### Env (HTTP mode)

| Variable | Source |
|----------|--------|
| `TRIO_MCP_MODE` | `http` |
| `TRIO_APP_URL` | Shown in Settings (e.g. production URL) |
| `TRIO_MCP_API_KEY` | Created in Settings (shown once) |
| `TRIO_TENANT_ID` | Shown in Settings |

No `AWS_*` credentials needed on the Claude machine.

## Tools

| Tool | Description |
|------|-------------|
| `search_candidates` | Search candidates |
| `get_candidate` | Get one candidate |
| `add_note` | Activity note |
| `list_jobs` | List jobs |

## App HTTP API (what the MCP process calls)

All require `Authorization: Bearer <key>` and `X-Trio-Tenant-Id: <tenantId>`:

- `GET /api/mcp/v1/candidates?q=&limit=`
- `GET /api/mcp/v1/candidates/:id`
- `POST /api/mcp/v1/candidates/:id/notes` `{ "noteText", "noteType?" }`
- `GET /api/mcp/v1/jobs?status=&limit=`

## Legacy: direct DynamoDB mode

If `TRIO_APP_URL` is unset and `TRIO_MCP_MODE` is not `http`, the server uses AWS credentials + `TRIO_TENANT_ID` (original first slice). Prefer HTTP mode for people you only give an API key.

## Install

```bash
cd mcp-server
npm install
npm start   # requires env; Claude sets env when launching
```

## Security

- Only **customer admins** can create/revoke keys in Settings
- Keys are stored **hashed**; plaintext shown once
- Keys are tenant-scoped
- Revoke anytime from Settings → Integrations
