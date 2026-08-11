/**
 * In-process MCP server for remote Streamable HTTP transport.
 * Recruiting tools bound to one authenticated tenant.
 *
 * Prefer recruiter-language tool descriptions — Claude chooses tools from them.
 *
 * @serverOnly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ValidatedMcpKey } from "@/lib/mcp/api-keys";
import {
  createLead,
  getAllLeads,
  getLeadById,
  updateLead,
} from "@/lib/db/repositories/lead-repository";
import {
  getAllJobs,
  getJobById,
  linkCandidateToJob,
} from "@/lib/db/repositories/job-repository";
import {
  addNoteToCandidate,
  getCandidateEvents,
} from "@/lib/events/candidate-events";
import {
  setCandidatePipelineStage,
  normStatus,
} from "@/lib/candidates/stage-sync";
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

const STAGE_HINT =
  "Common stages: sourced, contacted, interested, pre_screened, submitted, interviewing, second_interview, offer_out, offer_accepted, placed, rejected, not_interested";

function summarizeLead(l: any) {
  const linked = Array.isArray(l.linkedJobs) ? l.linkedJobs : [];
  const primaryStage = linked[0]?.stage || l.status || null;
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

function summarizeJob(j: any) {
  return {
    id: j.id,
    title: j.title || null,
    status: j.status || null,
    companyName: j.companyName || null,
    companyId: j.companyId || null,
    location: j.location || null,
    employmentType: j.employmentType || null,
    salaryRange: j.salaryRange || null,
    candidateCount: Array.isArray(j.candidates) ? j.candidates.length : 0,
    descriptionPreview: j.description
      ? String(j.description).slice(0, 280)
      : null,
    createdAt: j.created_at || null,
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
      ? l.linkedJobs.flatMap((j: any) => [
          j.stage,
          j.title,
          j.jobTitle,
          j.jobId,
        ])
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
  return linked.some((j: any) => String(j?.jobId || j?.id || "") === want);
}

/**
 * Build a fresh MCP server bound to one authenticated tenant.
 * One instance per HTTP request (stateless / serverless-safe).
 */
export function createTrioMcpServer(auth: ValidatedMcpKey): McpServer {
  const server = new McpServer({
    name: "trio-recruiting",
    version: "2.2.0",
  });

  const tenantId = auth.tenantId;
  const actor = `mcp:${auth.keyName}`;
  const actorUser = { userId: auth.keyId || "mcp", email: actor };

  // =========================================================================
  // READ
  // =========================================================================

  server.tool(
    "list_candidates",
    [
      "Find people in the ATS (candidates/leads).",
      "Use when the user asks who is in the system, wants to search by name/email/title/skills,",
      "filter by pipeline stage, or see who is on a job.",
      "Returns a short list (id, name, stage, title, linked jobs) — call get_candidate for full detail.",
    ].join(" "),
    {
      query: z
        .string()
        .optional()
        .describe(
          "Free-text: person name, email, phone, job title, skills, location, or source"
        ),
      stage: z
        .string()
        .optional()
        .describe(
          `Only candidates currently in this pipeline stage. ${STAGE_HINT}`
        ),
      jobId: z
        .string()
        .optional()
        .describe(
          "Only candidates linked to this job id (get id from list_jobs first)"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20, max 50)"),
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

  server.tool(
    "search_candidates",
    "Same as list_candidates with a required search string. Prefer list_candidates when filtering by stage or job.",
    {
      query: z.string().describe("Name, email, title, or other search text"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) => {
      try {
        const q = (query || "").trim().toLowerCase();
        const max = limit ?? 20;
        const leads = await getAllLeads(tenantId);
        const rows = q ? leads.filter((l: any) => matchesQuery(l, q)) : leads;
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

  server.tool(
    "get_candidate",
    [
      "Load one candidate’s full profile by id, including linked jobs and recent activity notes.",
      "Use after list_candidates when you need email/phone, summary, skills, or recent notes before writing or updating stage.",
    ].join(" "),
    {
      candidateId: z
        .string()
        .describe("Candidate UUID from list_candidates or the ATS"),
    },
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
            limit: 20,
            eventTypes: ["NOTE"],
          });
          recentNotes = (events.events || []).slice(0, 20).map((ev: any) => ({
            id: ev.SK || ev.eventId || null,
            date: ev.createdAt || null,
            title: ev.title || null,
            text: ev.description || ev.metadata?.noteText || null,
            type: ev.metadata?.noteType || null,
            createdBy: ev.createdBy || null,
          }));
        } catch {
          /* optional */
        }

        return textResult({
          tenantId,
          candidate: {
            ...summarizeLead(l),
            notesField: l.notes || null,
            summary: l.summary || null,
            linkedin_url: l.linkedin_url || null,
            salary_requirements: l.salary_requirements || null,
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

  server.tool(
    "list_jobs",
    [
      "List job openings / positions in the ATS.",
      "Use when matching candidates to roles, checking open reqs, or before link_candidate_to_job.",
      "Default shows Open jobs only.",
    ].join(" "),
    {
      status: z
        .string()
        .optional()
        .describe(
          "open (default) | closed | all | or exact: Open, Paused, Filled, Lost, Closed"
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max jobs (default 20)"),
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
        const rows = jobs.slice(0, limit ?? 20).map(summarizeJob);
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

  server.tool(
    "get_job",
    [
      "Get one job/req by id: title, company, status, location, description preview, and candidate count.",
      "Use when the user asks about a specific opening or before linking candidates.",
    ].join(" "),
    {
      jobId: z.string().describe("Job UUID from list_jobs"),
    },
    async ({ jobId }) => {
      try {
        const id = jobId.trim();
        if (!id) return errorResult("jobId is required");
        const job = await getJobById(tenantId, id);
        if (!job) return errorResult(`Job not found: ${id}`);
        const j = job as any;
        const candidates = Array.isArray(j.candidates)
          ? j.candidates.slice(0, 40).map((c: any) => ({
              candidateId: c.candidateId || null,
              name: c.candidateName || null,
              email: c.candidateEmail || null,
              stage: c.stage || null,
            }))
          : [];
        return textResult({
          tenantId,
          job: {
            ...summarizeJob(j),
            description: j.description || null,
            candidatesOnJob: candidates,
          },
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "search_pipeline",
    [
      "Pipeline snapshot: counts of candidates by stage, with a small sample per stage.",
      "Use for “what does my pipeline look like?” or “who is interviewing on this job?”",
      "Not a full export — use list_candidates with stage/jobId for complete lists.",
    ].join(" "),
    {
      jobId: z
        .string()
        .optional()
        .describe("Optional: only this job’s pipeline"),
      limitPerStage: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Sample size per stage (default 10)"),
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
          {
            stage: string;
            count: number;
            sample: ReturnType<typeof summarizeLead>[];
          }
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
            if (!buckets[st]) buckets[st] = { stage: st, count: 0, sample: [] };
            buckets[st].count += 1;
            if (buckets[st].sample.length < per) {
              buckets[st].sample.push(summarizeLead(l));
            }
          } else if (linked.length) {
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
            if (!buckets[st]) buckets[st] = { stage: st, count: 0, sample: [] };
            buckets[st].count += 1;
            if (buckets[st].sample.length < per) {
              buckets[st].sample.push(summarizeLead(l));
            }
          }
        }

        return textResult({
          tenantId,
          jobId: jobId || null,
          totalCandidates: leads.length,
          stages: Object.values(buckets).sort((a, b) =>
            a.stage.localeCompare(b.stage)
          ),
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_candidate_activity",
    [
      "Recent activity timeline for one candidate (notes and other events).",
      "Use when the user asks what happened with someone, or wants call/interview history.",
    ].join(" "),
    {
      candidateId: z.string().describe("Candidate UUID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max events (default 20)"),
    },
    async ({ candidateId, limit }) => {
      try {
        const id = candidateId.trim();
        if (!id) return errorResult("candidateId is required");
        const lead = await getLeadById(tenantId, id);
        if (!lead) return errorResult(`Candidate not found: ${id}`);
        const max = limit ?? 20;
        const events = await getCandidateEvents(id, { limit: max });
        const rows = (events.events || []).slice(0, max).map((ev: any) => ({
          date: ev.createdAt || null,
          type: ev.eventType || null,
          title: ev.title || null,
          description: ev.description || null,
          createdBy: ev.createdBy || null,
        }));
        return textResult({
          tenantId,
          candidateId: id,
          candidateName: (lead as any).name || null,
          count: rows.length,
          activity: rows,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // =========================================================================
  // WRITE
  // =========================================================================

  server.tool(
    "create_candidate",
    [
      "Create a new candidate (person) in the ATS.",
      "Use when the user wants to add someone new — name is required; email/phone/title optional.",
      "Does not auto-link to a job; call link_candidate_to_job after if needed.",
    ].join(" "),
    {
      name: z.string().min(1).max(100).describe("Full name (required)"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      title: z.string().optional().describe("Current or target job title"),
      location: z.string().optional().describe("City / location"),
      source: z
        .string()
        .optional()
        .describe("Where they came from (e.g. LinkedIn, referral, inbound)"),
      skills: z
        .array(z.string())
        .optional()
        .describe("Skill tags as short strings"),
      summary: z.string().optional().describe("Short profile summary"),
      linkedin_url: z.string().optional().describe("LinkedIn profile URL"),
      notes: z.string().optional().describe("Initial free-text notes field"),
    },
    async (input) => {
      try {
        const name = input.name.trim();
        if (!name) return errorResult("name is required");
        const lead = await createLead(
          tenantId,
          {
            name,
            email: input.email?.trim() || "",
            phone: input.phone?.trim() || "",
            title: input.title?.trim() || "",
            location: input.location?.trim() || "",
            source: input.source?.trim() || "mcp",
            notes: input.notes?.trim() || "",
            linkedin_url: input.linkedin_url?.trim() || "",
            status: "identification",
            skills: input.skills,
            summary: input.summary?.trim(),
          } as any,
          actorUser
        );
        return textResult({
          success: true,
          tenantId,
          candidate: summarizeLead(lead),
          message: `Created candidate ${lead.name} (${lead.id})`,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "update_candidate",
    [
      "Update fields on an existing candidate (name, email, phone, title, location, skills, summary, etc.).",
      "Use for profile corrections — not for pipeline stage (use update_candidate_stage) or timeline notes (use add_note).",
    ].join(" "),
    {
      candidateId: z.string().describe("Candidate UUID"),
      name: z.string().optional(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      location: z.string().optional().nullable(),
      source: z.string().optional().nullable(),
      skills: z.array(z.string()).optional().nullable(),
      summary: z.string().optional().nullable(),
      notes: z
        .string()
        .optional()
        .nullable()
        .describe("Profile notes field (not timeline activity)"),
      linkedin_url: z.string().optional().nullable(),
      salary_requirements: z.string().optional().nullable(),
    },
    async (input) => {
      try {
        const id = input.candidateId.trim();
        if (!id) return errorResult("candidateId is required");
        const existing = await getLeadById(tenantId, id);
        if (!existing) return errorResult(`Candidate not found: ${id}`);

        const patch: Record<string, unknown> = {};
        const keys = [
          "name",
          "email",
          "phone",
          "title",
          "location",
          "source",
          "skills",
          "summary",
          "notes",
          "linkedin_url",
          "salary_requirements",
        ] as const;
        for (const k of keys) {
          if (input[k] !== undefined) patch[k] = input[k];
        }
        if (Object.keys(patch).length === 0) {
          return errorResult("No fields to update");
        }

        const updated = await updateLead(tenantId, id, patch as any);
        if (!updated) return errorResult("Update failed");
        return textResult({
          success: true,
          tenantId,
          candidate: summarizeLead(updated),
          message: `Updated candidate ${id}`,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "update_candidate_stage",
    [
      "Move a candidate to a new pipeline stage (e.g. interviewing, submitted, offer_out).",
      "This is the primary write recruiters do all day. Optionally scope to one job and add a note.",
      STAGE_HINT,
    ].join(" "),
    {
      candidateId: z.string().describe("Candidate UUID"),
      newStage: z
        .string()
        .describe(`Target stage (snake_case preferred). ${STAGE_HINT}`),
      jobId: z
        .string()
        .optional()
        .describe("If set, only update stage on this linked job application"),
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

  server.tool(
    "add_note",
    [
      "Add a timeline/activity note on a candidate (calls, interviews, feedback).",
      "Use after conversations or when the user says “log that…” / “note that…”.",
      "Does not change pipeline stage unless you also call update_candidate_stage.",
    ].join(" "),
    {
      candidateId: z.string().describe("Candidate UUID"),
      text: z.string().min(1).describe("Note body the recruiter would write"),
      noteType: z
        .string()
        .optional()
        .describe("Optional type, e.g. Note, Call, Interview (default Note)"),
      jobId: z
        .string()
        .optional()
        .describe("Optional job this note relates to"),
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

  server.tool(
    "add_candidate_note",
    "Alias of add_note (parameter name noteText). Prefer add_note.",
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

  server.tool(
    "link_candidate_to_job",
    [
      "Attach a candidate to a job/req (create an application on that pipeline).",
      "Use when the user says someone should be on a specific opening.",
      "Fails if already linked. Default starting stage is sourced.",
    ].join(" "),
    {
      candidateId: z.string().describe("Candidate UUID"),
      jobId: z.string().describe("Job UUID from list_jobs"),
      stage: z
        .string()
        .optional()
        .describe(`Initial stage on this job (default sourced). ${STAGE_HINT}`),
      notes: z
        .string()
        .optional()
        .describe("Optional note when linking"),
    },
    async ({ candidateId, jobId, stage, notes }) => {
      try {
        const cid = candidateId.trim();
        const jid = jobId.trim();
        if (!cid) return errorResult("candidateId is required");
        if (!jid) return errorResult("jobId is required");

        const lead = await getLeadById(tenantId, cid);
        if (!lead) return errorResult(`Candidate not found: ${cid}`);
        const job = await getJobById(tenantId, jid);
        if (!job) return errorResult(`Job not found: ${jid}`);

        const initialStage = normStatus(stage || "sourced") || "sourced";

        await linkCandidateToJob(tenantId, jid, {
          candidateId: cid,
          candidateName: (lead as any).name || "Candidate",
          candidateEmail: (lead as any).email || "",
          stage: initialStage,
          notes: notes?.trim() || "",
        });

        if (notes?.trim()) {
          await addNoteToCandidate(cid, notes.trim(), actor, {
            noteType: "Note",
            jobId: jid,
            jobTitle: (job as any).title || null,
            companyName: (job as any).companyName || null,
            tenantId,
            via: "mcp-link-job",
          });
        }

        return textResult({
          success: true,
          tenantId,
          candidateId: cid,
          candidateName: (lead as any).name || null,
          jobId: jid,
          jobTitle: (job as any).title || null,
          stage: initialStage,
          message: `Linked ${(lead as any).name || cid} to ${(job as any).title || jid} at ${initialStage}`,
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
  );

  return server;
}
