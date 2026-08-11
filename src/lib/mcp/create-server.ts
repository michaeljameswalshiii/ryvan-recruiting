/**
 * In-process MCP server for remote Streamable HTTP transport.
 * High-leverage recruiting tools bound to one authenticated tenant.
 *
 * Tools:
 *   list_candidates, get_candidate, update_candidate_stage,
 *   add_note, list_jobs, search_pipeline
 *
 * @serverOnly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ValidatedMcpKey } from "@/lib/mcp/api-keys";
import { getAllLeads, getLeadById } from "@/lib/db/repositories/lead-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import {
  addNoteToCandidate,
  getCandidateEvents,
} from "@/lib/events/candidate-events";
import { setCandidatePipelineStage, normStatus } from "@/lib/candidates/stage-sync";
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

function summarizeLead(l: any) {
  const linked = Array.isArray(l.linkedJobs) ? l.linkedJobs : [];
  const primaryStage =
    linked[0]?.stage || l.status || null;
  return {
    id: l.id,
    name: l.name || null,
    email: l.email || null,
    phone: l.phone || null,
    title: l.title || null,
    stage: primaryStage,
    status: l.status || null,
    source: l.source || null,
    location: l.location || null,
    skills: l.skills || null,
    linkedJobs: linked.map((j: any) => ({
      jobId: j.jobId || j.id || null,
      title: j.title || j.jobTitle || null,
      stage: j.stage || null,
      companyName: j.companyName || null,
    })),
    linkedJobCount: linked.length,
    createdAt: l.created_at || null,
  };
}

function matchesQuery(l: any, q: string): boolean {
  if (!q) return true;
  const hay = [
    l.name,
    l.email,
    l.phone,
    l.title,
    l.status,
    l.source,
    l.location,
    l.id,
    Array.isArray(l.skills) ? l.skills.join(" ") : l.skills,
    ...(Array.isArray(l.linkedJobs)
      ? l.linkedJobs.flatMap((j: any) => [j.stage, j.title, j.jobTitle, j.jobId])
      : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function stageOnLead(l: any, stageFilter: string): boolean {
  const want = normStatus(stageFilter);
  if (!want) return true;
  if (normStatus(l.status) === want) return true;
  const linked = Array.isArray(l.linkedJobs) ? l.linkedJobs : [];
  return linked.some((j: any) => normStatus(j?.stage) === want);
}

function jobOnLead(l: any, jobId: string): boolean {
  const want = jobId.trim();
  if (!want) return true;
  const linked = Array.isArray(l.linkedJobs) ? l.linkedJobs : [];
  return linked.some(
    (j: any) => String(j?.jobId || j?.id || "") === want
  );
}

/**
 * Build a fresh MCP server bound to one authenticated tenant.
 * Create one instance per HTTP request (stateless / serverless-safe).
 */
export function createTrioMcpServer(auth: ValidatedMcpKey): McpServer {
  const server = new McpServer({
    name: "trio-recruiting",
    version: "2.1.0",
  });

  const tenantId = auth.tenantId;
  const actor = `mcp:${auth.keyName}`;

  // -------------------------------------------------------------------------
  // 1. list_candidates
  // -------------------------------------------------------------------------
  server.tool(
    "list_candidates",
    "Search or list candidates in the ATS. Filter by name/free-text, pipeline stage, or job id. Use for pipeline overviews and finding people.",
    {
      query: z
        .string()
        .optional()
        .describe("Name, email, title, skills, or free-text search"),
      stage: z
        .string()
        .optional()
        .describe(
          "Pipeline stage (e.g. interviewing, submitted, offer_out, sourced)"
        ),
      jobId: z.string().optional().describe("Job / position id"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, stage, jobId, limit }) => {
      try {
        const q = (query || "").trim().toLowerCase();
        const max = limit ?? 20;
        let leads = await getAllLeads(tenantId);
        if (q) leads = leads.filter((l: any) => matchesQuery(l, q));
        if (stage?.trim()) {
          leads = leads.filter((l: any) => stageOnLead(l, stage));
        }
        if (jobId?.trim()) {
          leads = leads.filter((l: any) => jobOnLead(l, jobId));
        }
        const candidates = leads.slice(0, max).map(summarizeLead);
        return textResult({
          tenantId,
          filters: {
            query: q || null,
            stage: stage || null,
            jobId: jobId || null,
            limit: max,
          },
          count: candidates.length,
          candidates,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // Back-compat alias used by older clients
  server.tool(
    "search_candidates",
    "Alias of list_candidates. Search Trio Recruiting candidates by name, email, phone, title, status, or source.",
    {
      query: z.string().describe("Search text"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        const q = (query || "").trim().toLowerCase();
        const max = limit ?? 20;
        const leads = await getAllLeads(tenantId);
        const rows = q
          ? leads.filter((l: any) => matchesQuery(l, q))
          : leads;
        return textResult({
          tenantId,
          query: q || null,
          count: Math.min(rows.length, max),
          candidates: rows.slice(0, max).map(summarizeLead),
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // -------------------------------------------------------------------------
  // 2. get_candidate
  // -------------------------------------------------------------------------
  server.tool(
    "get_candidate",
    "Retrieve full details for a candidate by id, including recent activity notes.",
    { candidateId: z.string().describe("Candidate UUID") },
    async ({ candidateId }) => {
      try {
        const id = candidateId.trim();
        if (!id) return errorResult("candidateId is required");
        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        const l = lead as any;

        let recentNotes: unknown[] = [];
        try {
          const events = await getCandidateEvents(id, {
            limit: 15,
            eventTypes: ["NOTE"],
          });
          recentNotes = (events.events || []).slice(0, 15).map((ev: any) => ({
            id: ev.SK || ev.eventId || null,
            date: ev.createdAt || null,
            title: ev.title || null,
            text: ev.description || ev.metadata?.noteText || null,
            type: ev.metadata?.noteType || null,
            createdBy: ev.createdBy || null,
          }));
        } catch {
          /* notes optional */
        }

        return textResult({
          tenantId,
          candidate: {
            ...summarizeLead(l),
            notesField: l.notes || null,
            summary: l.summary || null,
            linkedJobs: l.linkedJobs || [],
            modifiedAt: l.modified_at || null,
            recentNotes,
          },
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // -------------------------------------------------------------------------
  // 3. update_candidate_stage
  // -------------------------------------------------------------------------
  server.tool(
    "update_candidate_stage",
    "Move a candidate to a new pipeline stage (e.g. interviewing, submitted, offer_out). Optionally scope to one job and attach a note.",
    {
      candidateId: z.string().describe("Candidate UUID"),
      newStage: z
        .string()
        .describe(
          "Target stage (snake_case preferred: interviewing, submitted, offer_out, rejected, …)"
        ),
      jobId: z
        .string()
        .optional()
        .describe("If set, only update stage on this linked job"),
      note: z
        .string()
        .optional()
        .describe("Optional note explaining the stage change"),
    },
    async ({ candidateId, newStage, jobId, note }) => {
      try {
        const id = candidateId.trim();
        const stage = (newStage || "").trim();
        if (!id) return errorResult("candidateId is required");
        if (!stage) return errorResult("newStage is required");

        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);

        const result = await setCandidatePipelineStage(id, stage, {
          tenantId,
          jobId: jobId?.trim() || null,
        });

        if (note?.trim()) {
          await addNoteToCandidate(id, note.trim(), actor, {
            noteType: "Note",
            stage: result.stageToStore || normStatus(stage),
            jobId: jobId?.trim() || null,
            tenantId,
            via: "mcp-stage-change",
          });
        }

        return textResult({
          success: result.stageUpdated || result.linkedJobsSynced,
          tenantId,
          candidateId: id,
          candidateName: (lead as any).name || null,
          previousStage: result.previousStage,
          newStage: result.newStage || normStatus(stage),
          stageToStore: result.stageToStore,
          linkedJobsSynced: result.linkedJobsSynced,
          jobId: jobId || null,
          note: note?.trim() || null,
          message: `Candidate ${id} → ${result.stageToStore || stage}`,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // -------------------------------------------------------------------------
  // 4. add_note
  // -------------------------------------------------------------------------
  server.tool(
    "add_note",
    "Add an activity note to a candidate timeline. Use after calls, interviews, or any recruiter follow-up.",
    {
      candidateId: z.string().describe("Candidate UUID"),
      text: z.string().min(1).describe("Note content"),
      noteType: z
        .string()
        .optional()
        .describe("Optional type label (default Note)"),
      jobId: z.string().optional().describe("Optional related job id"),
    },
    async ({ candidateId, text, noteType, jobId }) => {
      try {
        const id = candidateId.trim();
        const body = text.trim();
        if (!id) return errorResult("candidateId is required");
        if (!body) return errorResult("text is required");

        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);

        const result = await addNoteToCandidate(id, body, actor, {
          noteType: noteType?.trim() || "Note",
          jobId: jobId?.trim() || null,
          tenantId,
          via: "mcp-remote",
        });

        if (!result.success) {
          return errorResult(result.error || "Failed to add note");
        }

        return textResult({
          success: true,
          tenantId,
          candidateId: id,
          candidateName: (lead as any).name || null,
          eventId: result.eventId,
          text: body,
          message: "Note recorded on candidate activity log",
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // Back-compat: older schema used noteText
  server.tool(
    "add_candidate_note",
    "Alias of add_note. Add an activity note to a candidate timeline.",
    {
      candidateId: z.string(),
      noteText: z.string().min(1),
      noteType: z.string().optional(),
    },
    async ({ candidateId, noteText, noteType }) => {
      try {
        const id = candidateId.trim();
        const body = noteText.trim();
        if (!id) return errorResult("candidateId is required");
        if (!body) return errorResult("noteText is required");
        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        const result = await addNoteToCandidate(id, body, actor, {
          noteType: noteType?.trim() || "Note",
          tenantId,
          via: "mcp-remote",
        });
        if (!result.success) {
          return errorResult(result.error || "Failed to add note");
        }
        return textResult({
          success: true,
          candidateId: id,
          eventId: result.eventId,
          message: "Note recorded on candidate activity log",
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // -------------------------------------------------------------------------
  // 5. list_jobs
  // -------------------------------------------------------------------------
  server.tool(
    "list_jobs",
    "List open jobs / positions in the ATS. Filter by status: open, closed, all (or Open, Paused, Filled, Lost, Closed).",
    {
      status: z
        .string()
        .optional()
        .describe(
          "Job status filter: open | closed | all | Open | Paused | Filled | Lost | Closed (default open)"
        ),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ status, limit }) => {
      try {
        let jobs = await getAllJobs(tenantId);
        const st = (status || "open").toString();
        if (st.toLowerCase() !== "all") {
          if (st.toLowerCase() === "open") {
            jobs = jobs.filter(
              (j: any) => normalizeJobStatus(j.status) === "Open"
            );
          } else if (st.toLowerCase() === "closed") {
            jobs = jobs.filter((j: any) => {
              const s = normalizeJobStatus(j.status);
              return s === "Closed" || s === "Filled" || s === "Lost";
            });
          } else {
            const want = normalizeJobStatus(st);
            jobs = jobs.filter(
              (j: any) => normalizeJobStatus(j.status) === want
            );
          }
        }
        const rows = jobs.slice(0, limit ?? 20).map((j: any) => ({
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
          statusFilter: status || "open",
          count: rows.length,
          jobs: rows,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // -------------------------------------------------------------------------
  // 6. search_pipeline
  // -------------------------------------------------------------------------
  server.tool(
    "search_pipeline",
    "Quick pipeline overview: candidates grouped by stage. Optionally filter to one job.",
    {
      jobId: z.string().optional().describe("Limit to one job / position"),
      limitPerStage: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Max candidates listed per stage (default 10)"),
    },
    async ({ jobId, limitPerStage }) => {
      try {
        const per = limitPerStage ?? 10;
        let leads = await getAllLeads(tenantId);
        if (jobId?.trim()) {
          leads = leads.filter((l: any) => jobOnLead(l, jobId));
        }

        const buckets: Record<
          string,
          { stage: string; count: number; sample: ReturnType<typeof summarizeLead>[] }
        > = {};

        for (const l of leads) {
          const linked = Array.isArray((l as any).linkedJobs)
            ? (l as any).linkedJobs
            : [];
          if (jobId?.trim() && linked.length) {
            const j = linked.find(
              (x: any) => String(x?.jobId || x?.id || "") === jobId.trim()
            );
            const st = normStatus(j?.stage || (l as any).status) || "unknown";
            if (!buckets[st]) {
              buckets[st] = { stage: st, count: 0, sample: [] };
            }
            buckets[st].count += 1;
            if (buckets[st].sample.length < per) {
              buckets[st].sample.push(summarizeLead(l));
            }
          } else if (linked.length) {
            // Count each linked job stage once per candidate-job pair
            const seen = new Set<string>();
            for (const j of linked) {
              const st = normStatus(j?.stage) || "unknown";
              if (seen.has(st)) continue;
              seen.add(st);
              if (!buckets[st]) {
                buckets[st] = { stage: st, count: 0, sample: [] };
              }
              buckets[st].count += 1;
              if (buckets[st].sample.length < per) {
                buckets[st].sample.push(summarizeLead(l));
              }
            }
          } else {
            const st = normStatus((l as any).status) || "unknown";
            if (!buckets[st]) {
              buckets[st] = { stage: st, count: 0, sample: [] };
            }
            buckets[st].count += 1;
            if (buckets[st].sample.length < per) {
              buckets[st].sample.push(summarizeLead(l));
            }
          }
        }

        const stages = Object.values(buckets).sort((a, b) =>
          a.stage.localeCompare(b.stage)
        );

        return textResult({
          tenantId,
          jobId: jobId || null,
          totalCandidates: leads.length,
          stages,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  return server;
}
