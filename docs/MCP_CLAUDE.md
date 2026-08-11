# Trio MCP — Claude connector

Remote Streamable HTTP MCP for recruiting tools. Endpoint:

```
https://<your-domain>/api/mcp
```

## Tools

| Tool | Purpose |
|------|---------|
| `list_candidates` | Search / filter candidates (query, stage, jobId) |
| `get_candidate` | Full candidate + recent notes |
| `update_candidate_stage` | Move pipeline stage (optional job + note) |
| `add_note` | Activity note on candidate |
| `list_jobs` | Open (or filtered) jobs |
| `search_pipeline` | Candidates grouped by stage |

Legacy aliases: `search_candidates`, `add_candidate_note`.

## Auth

1. **Production:** Create a key in **Company Settings → MCP API keys** (team admin).  
   Key format: `trio_mcp_…`  
   Send: `Authorization: Bearer <key>`  
   Tenant is resolved from the key (optional `X-Trio-Tenant-Id` still supported).

2. **Dev / smoke test:** set env:
   ```bash
   TRIO_MCP_TEST_KEY=trio_mcp_dev_key_change_me
   TRIO_MCP_TEST_TENANT_ID=tenant-xxxxxxxx
   ```

Middleware requires a Bearer token on `/api/mcp` (session cookie not used).

## Claude.ai

1. Connectors → Add custom connector  
2. URL: `https://turnkey-optimization.vercel.app/api/mcp` (or your domain)  
3. Auth header: `Authorization: Bearer <your_key>`  
4. Try: “List my open candidates” or “Move &lt;name&gt; to interviewing and add a note that the screen went well.”

## Claude Code

```bash
claude mcp add --transport http trio-recruiting https://YOUR_APP/api/mcp \
  --header "Authorization: Bearer YOUR_KEY"
```

## REST mirrors (optional)

Same auth as MCP:

- `GET /api/mcp/v1/candidates?q=&limit=`
- `GET /api/mcp/v1/candidates/:id`
- `POST /api/mcp/v1/candidates/:id/notes` `{ "noteText": "..." }`
- `GET /api/mcp/v1/jobs?status=open&limit=`

## Notes

- Data is **tenant-isolated** via the resolved API key’s tenant.
- Stage writes use `setCandidatePipelineStage` (lead + linked jobs).
- Notes store events with the MCP tenant id (not session).
