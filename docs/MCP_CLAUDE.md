# Trio MCP — Claude connector

Remote Streamable HTTP MCP for recruiting tools.

```
https://turnkey-optimization.vercel.app/api/mcp
```

## Tools

### Read
| Tool | When Claude should use it |
|------|---------------------------|
| `list_candidates` | Find people (name/skills/stage/job filters) |
| `get_candidate` | Full profile + recent notes by id |
| `list_jobs` | Open reqs / positions |
| `get_job` | One job + candidates on it |
| `search_pipeline` | Stage counts / pipeline snapshot |
| `list_candidate_activity` | Timeline history |

### Write
| Tool | When Claude should use it |
|------|---------------------------|
| `create_candidate` | Add a new person (name required) |
| `update_candidate` | Fix profile fields (not stage) |
| `update_candidate_stage` | Move pipeline stage |
| `add_note` | Log a call/interview note |
| `link_candidate_to_job` | Put someone on a job/req |

Legacy aliases: `search_candidates`, `add_candidate_note`.

## Auth for Claude.ai (required path)

Claude custom connectors use **OAuth 2.1 + PKCE**, not only a static API key.

### Happy path

1. In Trio, select a **customer company** in the header (not **All Tenants** / Platform).
2. Be logged in as **Company Admin** or **Site Admin**.
3. In Claude: **Customize → Connectors → Add custom connector**
4. URL: `https://turnkey-optimization.vercel.app/api/mcp`
5. Click **Connect** → browser opens Trio **Authorize connection** → approve.
6. Claude Dynamic Client Registration hits `/api/oauth/register` automatically.

### If you see “Invalid connection request”

That screen is **Trio’s** OAuth page. Common causes:

| Cause | Fix |
|--------|-----|
| Organization mismatch / All Tenants | Select the real customer tenant, then Connect again |
| Not an admin | Use company_admin or site_admin |
| Unknown client | Remove connector in Claude, re-add (triggers DCR after deploy) |
| Manual setup | Company Settings → Integrations → create **OAuth client** → paste Client ID + Secret in Claude **Advanced settings** |

### Optional: static API keys (Claude Code)

Company Settings → Integrations → create `trio_mcp_…` key:

```bash
claude mcp add --transport http trio-recruiting https://turnkey-optimization.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

## REST mirrors (optional)

Same auth as MCP:

- `GET /api/mcp/v1/candidates?q=&limit=`
- `GET /api/mcp/v1/candidates/:id`
- `POST /api/mcp/v1/candidates/:id/notes` `{ "noteText": "..." }`
- `GET /api/mcp/v1/jobs?status=open&limit=`

## Notes

- Claude.ai data access is **tenant-isolated** to the org you authorize.
- Stage writes use `setCandidatePipelineStage` (lead + linked jobs).
