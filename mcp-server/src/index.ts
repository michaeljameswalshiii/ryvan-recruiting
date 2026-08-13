#!/usr/bin/env node
/**
 * Trio Recruiting MCP Server (stdio)
 *
 * Preferred mode (admin-issued keys from the web app):
 *   TRIO_MCP_MODE=http
 *   TRIO_APP_URL=https://your-app.vercel.app
 *   TRIO_MCP_API_KEY=trio_mcp_...
 *   TRIO_TENANT_ID=tenant-...
 *
 * Legacy direct DynamoDB mode (no app URL):
 *   TRIO_MCP_API_KEY + TRIO_TENANT_ID + AWS credentials
 *
 * Tools: companies/contacts + candidates/jobs
 * Do not write logs to stdout — it is the MCP transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { maskKey, requireMcpAuth } from "./auth.js";
import {
  getLead,
  listJobs,
  listLeads,
  putCandidateNote,
  summarizeJob,
  summarizeLead,
} from "./db.js";
import { getHttpConfig, mcpFetch } from "./http-client.js";

function log(...args: unknown[]) {
  console.error("[trio-mcp]", ...args);
}

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

async function main() {
  const http = getHttpConfig();
  let tenantId: string;

  if (http) {
    tenantId = http.tenantId;
    log(
      `HTTP mode app=${http.appUrl} tenant=${tenantId} key=${maskKey(http.apiKey)}`
    );
  } else {
    const auth = requireMcpAuth();
    tenantId = auth.tenantId;
    log(
      `DynamoDB mode tenant=${tenantId} key=${maskKey(auth.apiKey)} mode=${auth.label}`
    );
  }

  const server = new McpServer({
    name: "trio-recruiting",
    version: "2.4.0",
  });

  server.tool(
    "trio_help",
    "Call first. Trio has Companies + Contacts (CRM) and Candidates + Jobs (ATS). Hiring managers use create_company_with_primary_contact, never create_candidate.",
    {},
    async () =>
      textResult({
        version: "2.4.0",
        routing: {
          "company page + primary contact": "create_company_with_primary_contact",
          "hiring manager": "create_contact",
          "job seeker": "create_candidate",
        },
        tools: [
          "trio_help",
          "create_company_with_primary_contact",
          "create_company",
          "create_contact",
          "list_companies",
          "list_contacts",
          "search_candidates",
          "get_candidate",
          "create_candidate",
          "add_note",
          "list_jobs",
        ],
      })
  );

  server.tool(
    "create_company_with_primary_contact",
    "Create a Trio company page AND its primary contact. Use for hiring managers / client contacts. Do NOT create a candidate.",
    {
      company_name: z.string(),
      contact_name: z.string(),
      domain: z.string().optional(),
      industry: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      contact_title: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
    },
    async (input) => {
      try {
        if (!http) {
          return errorResult(
            "Company/contact create requires HTTP mode (TRIO_APP_URL + API key)."
          );
        }
        const data = await mcpFetch(http, "/api/mcp/v1/companies", {
          method: "POST",
          body: JSON.stringify({
            ...input,
            with_primary_contact: true,
          }),
        });
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "create_company",
    "Create a client company page in Trio Companies.",
    {
      name: z.string(),
      domain: z.string().optional(),
      industry: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
    },
    async (input) => {
      try {
        if (!http) {
          return errorResult(
            "Company create requires HTTP mode (TRIO_APP_URL + API key)."
          );
        }
        const data = await mcpFetch(http, "/api/mcp/v1/companies", {
          method: "POST",
          body: JSON.stringify(input),
        });
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "create_contact",
    "Add a hiring manager / business contact on a Trio company (Contacts, not Candidates).",
    {
      name: z.string(),
      companyId: z.string().optional(),
      companyName: z.string().optional(),
      title: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      isPrimary: z.boolean().optional(),
    },
    async (input) => {
      try {
        if (!http) {
          return errorResult(
            "Contact create requires HTTP mode (TRIO_APP_URL + API key)."
          );
        }
        const data = await mcpFetch(http, "/api/mcp/v1/contacts", {
          method: "POST",
          body: JSON.stringify(input),
        });
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_companies",
    "Find Trio company pages / accounts.",
    {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        if (!http) return errorResult("list_companies requires HTTP mode.");
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        params.set("limit", String(limit ?? 25));
        const data = await mcpFetch(
          http,
          `/api/mcp/v1/companies?${params.toString()}`
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_contacts",
    "Find Trio Contacts (hiring managers), not Candidates.",
    {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        if (!http) return errorResult("list_contacts requires HTTP mode.");
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        params.set("limit", String(limit ?? 25));
        const data = await mcpFetch(
          http,
          `/api/mcp/v1/contacts?${params.toString()}`
        );
        return textResult(data);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "search_candidates",
    "Search Trio Recruiting candidates by name, email, phone, title, status, or source.",
    {
      query: z.string().describe("Search text"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        if (http) {
          const q = encodeURIComponent(query.trim());
          const lim = limit ?? 20;
          const data = await mcpFetch(
            http,
            `/api/mcp/v1/candidates?q=${q}&limit=${lim}`
          );
          return textResult(data);
        }
        const q = query.trim().toLowerCase();
        if (!q) return errorResult("query is required");
        const max = limit ?? 20;
        const leads = await listLeads(tenantId);
        const hits = leads
          .filter((l) => {
            const hay = [
              l.name,
              l.email,
              l.phone,
              l.title,
              l.status,
              l.source,
              l.location,
              l.id,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return hay.includes(q);
          })
          .slice(0, max)
          .map(summarizeLead);
        return textResult({
          tenantId,
          query,
          count: hits.length,
          candidates: hits,
        });
      } catch (e) {
        log("search_candidates failed", e);
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_candidate",
    "Get a single Trio candidate by id.",
    { candidateId: z.string().describe("Candidate UUID") },
    async ({ candidateId }) => {
      try {
        const id = candidateId.trim();
        if (!id) return errorResult("candidateId is required");
        if (http) {
          const data = await mcpFetch(
            http,
            `/api/mcp/v1/candidates/${encodeURIComponent(id)}`
          );
          return textResult(data);
        }
        const lead = await getLead(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        return textResult({
          tenantId,
          candidate: {
            ...summarizeLead(lead),
            notes: lead.notes || null,
            linkedJobs: lead.linkedJobs || [],
            summary: lead.summary || null,
            skills: lead.skills || null,
          },
        });
      } catch (e) {
        log("get_candidate failed", e);
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "add_note",
    "Add an activity note to a candidate timeline.",
    {
      candidateId: z.string(),
      noteText: z.string().min(1),
      noteType: z.string().optional(),
    },
    async ({ candidateId, noteText, noteType }) => {
      try {
        const id = candidateId.trim();
        const text = noteText.trim();
        if (!id) return errorResult("candidateId is required");
        if (!text) return errorResult("noteText is required");

        if (http) {
          const data = await mcpFetch(
            http,
            `/api/mcp/v1/candidates/${encodeURIComponent(id)}/notes`,
            {
              method: "POST",
              body: JSON.stringify({
                noteText: text,
                noteType: noteType?.trim() || "Note",
              }),
            }
          );
          return textResult(data);
        }

        const lead = await getLead(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        const result = await putCandidateNote({
          tenantId,
          candidateId: id,
          noteText: text,
          noteType: noteType?.trim() || "Note",
          createdBy: "mcp-claude",
        });
        return textResult({
          success: true,
          candidateId: id,
          candidateName: lead.name || null,
          ...result,
        });
      } catch (e) {
        log("add_note failed", e);
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_jobs",
    "List jobs. Optional status filter: Open, Paused, Filled, Lost, Closed.",
    {
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ status, limit }) => {
      try {
        if (http) {
          const params = new URLSearchParams();
          if (status) params.set("status", status);
          params.set("limit", String(limit ?? 50));
          const data = await mcpFetch(
            http,
            `/api/mcp/v1/jobs?${params.toString()}`
          );
          return textResult(data);
        }
        let jobs = await listJobs(tenantId);
        if (status?.trim()) {
          const s = status.trim().toLowerCase();
          jobs = jobs.filter(
            (j) => String(j.status || "").toLowerCase() === s
          );
        }
        const rows = jobs.slice(0, limit ?? 50).map(summarizeJob);
        return textResult({
          tenantId,
          statusFilter: status || null,
          count: rows.length,
          jobs: rows,
        });
      } catch (e) {
        log("list_jobs failed", e);
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Connected on stdio");
}

main().catch((err) => {
  console.error("[trio-mcp] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
