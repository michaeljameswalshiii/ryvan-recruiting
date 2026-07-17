#!/usr/bin/env node
/**
 * Trio Recruiting MCP Server (stdio)
 *
 * First-slice tools:
 *   - search_candidates
 *   - get_candidate
 *   - add_note
 *   - list_jobs
 *
 * Auth: TRIO_MCP_API_KEY + TRIO_TENANT_ID (or TRIO_MCP_API_KEYS map)
 * Data: AWS DynamoDB (same tables as the Trio web app)
 *
 * IMPORTANT: Do not write logs to stdout — it is the MCP transport.
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
  const auth = requireMcpAuth();
  log(
    `Starting for tenant=${auth.tenantId} key=${maskKey(auth.apiKey)} mode=${auth.label}`
  );

  const server = new McpServer({
    name: "trio-recruiting",
    version: "1.0.0",
  });

  // ── search_candidates ─────────────────────────────────────────────
  server.tool(
    "search_candidates",
    "Search Trio Recruiting candidates (leads) by name, email, phone, title, status, or source. Returns a compact list.",
    {
      query: z
        .string()
        .describe(
          "Search text matched against name, email, phone, title, status, source (case-insensitive)"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
    },
    async ({ query, limit }) => {
      try {
        const q = query.trim().toLowerCase();
        if (!q) return errorResult("query is required");
        const max = limit ?? 20;
        const leads = await listLeads(auth.tenantId);
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
          tenantId: auth.tenantId,
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

  // ── get_candidate ─────────────────────────────────────────────────
  server.tool(
    "get_candidate",
    "Get a single Trio candidate by id (full profile summary + linked jobs).",
    {
      candidateId: z.string().describe("Candidate / lead UUID"),
    },
    async ({ candidateId }) => {
      try {
        const id = candidateId.trim();
        if (!id) return errorResult("candidateId is required");
        const lead = await getLead(auth.tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        return textResult({
          tenantId: auth.tenantId,
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

  // ── add_note ──────────────────────────────────────────────────────
  server.tool(
    "add_note",
    "Add an activity note to a candidate timeline (does not change pipeline stage).",
    {
      candidateId: z.string().describe("Candidate / lead UUID"),
      noteText: z.string().min(1).describe("Note body"),
      noteType: z
        .string()
        .optional()
        .describe("Optional type label, e.g. Conversation, Follow-up, Note"),
    },
    async ({ candidateId, noteText, noteType }) => {
      try {
        const id = candidateId.trim();
        if (!id) return errorResult("candidateId is required");
        const text = noteText.trim();
        if (!text) return errorResult("noteText is required");

        const lead = await getLead(auth.tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);

        const result = await putCandidateNote({
          tenantId: auth.tenantId,
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
          message: "Note recorded on candidate activity log",
        });
      } catch (e) {
        log("add_note failed", e);
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── list_jobs ─────────────────────────────────────────────────────
  server.tool(
    "list_jobs",
    "List jobs for the authenticated tenant. Optional status filter (Open, Paused, Filled, Lost, Closed).",
    {
      status: z
        .string()
        .optional()
        .describe(
          "Optional status filter (matched case-insensitively, e.g. Open)"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results (default 50)"),
    },
    async ({ status, limit }) => {
      try {
        const max = limit ?? 50;
        let jobs = await listJobs(auth.tenantId);
        if (status?.trim()) {
          const s = status.trim().toLowerCase();
          jobs = jobs.filter(
            (j) => String(j.status || "").toLowerCase() === s
          );
        }
        const rows = jobs.slice(0, max).map(summarizeJob);
        return textResult({
          tenantId: auth.tenantId,
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
