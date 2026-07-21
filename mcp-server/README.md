# Trio Recruiting MCP

Connect **Claude Desktop**, **Claude Code**, or other MCP clients to Trio.

## Recommended: fully remote (no local install)

1. Sign in to Trio as a **customer admin**
2. **Settings → Integrations**
3. **Create API key** — copy the key + ready-made config
4. Connect with the **remote MCP URL** only (no `npm install`, no repo path)

### Claude Code (CLI)

```bash
claude mcp add --transport http trio-recruiting https://YOUR_APP/api/mcp \
  --header "Authorization: Bearer trio_mcp_..." \
  --header "X-Trio-Tenant-Id: your-tenant-id"
```

### Config JSON (Claude Code / compatible clients)

```json
{
  "mcpServers": {
    "trio-recruiting": {
      "type": "http",
      "url": "https://YOUR_APP/api/mcp",
      "headers": {
        "Authorization": "Bearer trio_mcp_...",
        "X-Trio-Tenant-Id": "your-tenant-id"
      }
    }
  }
}
```

### Claude.ai / Desktop Connectors

1. **Settings → Connectors → Add custom connector**
2. URL: `https://YOUR_APP/api/mcp`
3. Auth: static request headers (beta) — `Authorization: Bearer …` and `X-Trio-Tenant-Id`

Settings → Integrations shows the exact values for your org after you create a key.

## Tools

| Tool | Description |
|------|-------------|
| `search_candidates` | Search candidates |
| `get_candidate` | Get one candidate |
| `add_note` | Activity note |
| `list_jobs` | List jobs |

## Server endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST/GET/DELETE /api/mcp` | **Remote MCP** (Streamable HTTP, protocol) |
| `GET /api/mcp/v1/candidates` | REST helper (used by legacy local bridge) |
| `GET /api/mcp/v1/candidates/:id` | REST helper |
| `POST /api/mcp/v1/candidates/:id/notes` | REST helper |
| `GET /api/mcp/v1/jobs` | REST helper |

All require `Authorization: Bearer <key>` and `X-Trio-Tenant-Id: <tenantId>`.

## Optional: local stdio bridge

Only needed for older clients that cannot speak remote Streamable HTTP.

```bash
cd mcp-server
npm install
```

Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trio-recruiting": {
      "command": "npx",
      "args": ["tsx", "C:/path/to/mcp-server/src/index.ts"],
      "env": {
        "TRIO_MCP_MODE": "http",
        "TRIO_APP_URL": "https://YOUR_APP",
        "TRIO_MCP_API_KEY": "trio_mcp_...",
        "TRIO_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

Prefer the remote URL above whenever possible.

## Security

- Only **customer admins** can create/revoke keys in Settings
- Keys are stored **hashed**; plaintext shown once
- Keys are tenant-scoped
- Revoke anytime from Settings → Integrations
