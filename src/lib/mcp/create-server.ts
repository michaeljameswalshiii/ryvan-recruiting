/**
 * In-process MCP server for remote Streamable HTTP transport.
 * Tools share the same data paths as /api/mcp/v1/*.
 *
 * @serverOnly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ValidatedMcpKey } from "@/lib/mcp/api-keys";
import { getAllLeads, getLeadById } from "@/lib/db/repositories/lead-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { addNoteToCandidate } from "@/lib/events/candidate-events";
import { normalizeJobStatus } from "@/lib/jobs/status";

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

/**
 * Build a fresh MCP server bound to one authenticated tenant.
 * Create one instance per HTTP request (stateless / serverless-safe).
 */
export function createTrioMcpServer(auth: ValidatedMcpKey): McpServer {
  const server = new McpServer({
    name: "trio-recruiting",
    version: "2.0.0",
  });

  const tenantId = auth.tenantId;
  const actor = `mcp:${auth.keyName}`;

  server.tool(
    "search_candidates",
    "Search Trio Recruiting candidates by name, email, phone, title, status, or source.",
    {
      query: z.string().describe("Search text"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        const q = (query || "").trim().toLowerCase();
        const max = limit ?? 20;
        const leads = await getAllLeads(tenantId);
        let rows = leads;
        if (q) {
          rows = leads.filter((l: any) => {
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
          });
        }
        const candidates = rows.slice(0, max).map((l: any) => ({
          id: l.id,
          name: l.name || null,
          email: l.email || null,
          phone: l.phone || null,
          title: l.title || null,
          status: l.status || null,
          source: l.source || null,
          location: l.location || null,
          linkedJobCount: Array.isArray(l.linkedJobs) ? l.linkedJobs.length : 0,
          createdAt: l.created_at || null,
        }));
        return textResult({
          tenantId,
          query: q || null,
          count: candidates.length,
          candidates,
        });
      } catch (e) {
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
        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        const l = lead as any;
        return textResult({
          tenantId,
          candidate: {
            id: l.id,
            name: l.name || null,
            email: l.email || null,
            phone: l.phone || null,
            title: l.title || null,
            status: l.status || null,
            source: l.source || null,
            location: l.location || null,
            notes: l.notes || null,
            summary: l.summary || null,
            skills: l.skills || null,
            linkedJobs: l.linkedJobs || [],
            createdAt: l.created_at || null,
            modifiedAt: l.modified_at || null,
          },
        });
      } catch (e) {
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

        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);

        const result = await addNoteToCandidate(id, text, actor, {
          noteType: noteType?.trim() || "Note",
          via: "mcp-remote",
        });

        if (!result.success) {
          return errorResult(result.error || "Failed to add note");
        }

        return textResult({
          success: true,
          candidateId: id,
          candidateName: (lead as any).name || null,
          eventId: result.eventId,
          message: "Note recorded on candidate activity log",
        });
      } catch (e) {
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
        let jobs = await getAllJobs(tenantId);
        if (status?.trim()) {
          const want = normalizeJobStatus(status.trim());
          jobs = jobs.filter(
            (j: any) => normalizeJobStatus(j.status) === want
          );
        }
        const rows = jobs.slice(0, limit ?? 50).map((j: any) => ({
          id: j.id,
          title: j.title || null,
          status: j.status || null,
          companyName: j.companyName || null,
          location: j.location || null,
          employmentType: j.employmentType || null,
          candidateCount: Array.isArray(j.candidates) ? j.candidates.length : 0,
          createdAt: j.created_at || null,
        }));
        return textResult({
          tenantId,
          statusFilter: status || null,
          count: rows.length,
          jobs: rows,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  return server;
}
