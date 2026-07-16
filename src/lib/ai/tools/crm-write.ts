/**
 * CRM write tools for General AI / Bedrock agent.
 * All mutations require tenant session + confirmed: true after a preview.
 *
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";
import {
  createLead,
  updateLead,
  getLeadById,
  PIPELINE_STAGES,
} from "../../db/repositories/lead-repository";
import {
  createClient,
  updateClient,
  getClientById,
  getAllClients,
  addContactToClient,
} from "../../db/repositories/client-repository";
import {
  createJob,
  updateJob,
  getJobById,
  linkCandidateToJob,
  updateCandidateStageInJob,
} from "../../db/repositories/job-repository";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function needTenant(context: ToolContext): ToolResult | null {
  if (!context.tenantId) {
    return {
      success: false,
      error: "Sign in required. Tenant context missing — cannot modify CRM data.",
      metadata: { reason: "no_tenant" },
    };
  }
  return null;
}

function isConfirmed(params: Record<string, unknown>): boolean {
  const c = params.confirmed;
  return c === true || c === "true" || c === 1 || c === "1" || c === "yes";
}

/** If not confirmed, return a preview payload the model must show the user */
function confirmGate(
  params: Record<string, unknown>,
  action: string,
  preview: Record<string, unknown>
): ToolResult | null {
  if (isConfirmed(params)) return null;
  return {
    success: true,
    data: {
      status: "needs_confirmation",
      action,
      message:
        "Do NOT invent that this was saved. Show the user this preview and ask them to confirm. " +
        "When they say yes, call this tool again with the same fields and confirmed: true.",
      preview,
    },
    metadata: { needs_confirmation: true, action },
  };
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

const CANDIDATE_STAGES = [
  "identification",
  "outreach",
  "conversation",
  "presented",
  "interview",
  "accept",
  "rejected",
  "new",
  "contacted",
  "qualified",
  "interested",
  "not_interested",
  "converted",
] as const;

function normalizeCandidateStage(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase().trim().replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    identify: "identification",
    identified: "identification",
    screening: "conversation",
    interview: "interview",
    interviewing: "interview",
    offer: "accept",
    hired: "accept",
    reject: "rejected",
  };
  const mapped = aliases[s] || s;
  if (CANDIDATE_STAGES.includes(mapped as (typeof CANDIDATE_STAGES)[number])) {
    return mapped;
  }
  if (PIPELINE_STAGES.includes(mapped)) return mapped;
  return undefined;
}

// ---------------------------------------------------------------------------
// create_candidate
// ---------------------------------------------------------------------------

export const CREATE_CANDIDATE_TOOL = "create_candidate";
export const CREATE_CANDIDATE_DESCRIPTION =
  "Create a new candidate/lead in the recruiting pipeline (Candidates list). " +
  "NOT for company contacts/hiring managers — use create_contact for Contact Info. " +
  "ALWAYS call once without confirmed to preview, show the user, then call again with " +
  "confirmed:true after they agree. Requires name. Optional company is only a note, " +
  "it does NOT add them under Contact Info.";

export async function executeCreateCandidate(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const name = str(p.name);
  if (!name) {
    return { success: false, error: "name is required to create a candidate" };
  }

  const stage = normalizeCandidateStage(str(p.status) || str(p.stage)) || "identification";
  const preview = {
    name,
    email: str(p.email) || "",
    phone: str(p.phone) || "",
    title: str(p.title) || "",
    location: str(p.location) || "",
    company: str(p.company) || "",
    status: stage,
    source: str(p.source) || "general-ai",
    notes: str(p.notes) || "",
    linkedin_url: str(p.linkedin_url) || str(p.linkedin) || "",
  };

  const gate = confirmGate(p, CREATE_CANDIDATE_TOOL, preview);
  if (gate) return gate;

  try {
    const notesParts = [preview.notes];
    if (preview.company) notesParts.unshift(`Company: ${preview.company}`);
    const lead = await createLead(context.tenantId!, {
      name: preview.name,
      email: preview.email,
      phone: preview.phone,
      title: preview.title,
      location: preview.location,
      status: stage as any,
      source: preview.source,
      notes: notesParts.filter(Boolean).join("\n"),
      linkedin_url: preview.linkedin_url,
    });

    return {
      success: true,
      data: {
        status: "created",
        candidate: {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          status: lead.status,
          title: lead.title,
        },
        message: `Created candidate ${lead.name} (id: ${lead.id}).`,
      },
      metadata: { action: CREATE_CANDIDATE_TOOL, id: lead.id },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create candidate",
    };
  }
}

// ---------------------------------------------------------------------------
// update_candidate
// ---------------------------------------------------------------------------

export const UPDATE_CANDIDATE_TOOL = "update_candidate";
export const UPDATE_CANDIDATE_DESCRIPTION =
  "Update an existing candidate/lead fields (name, email, phone, title, location, notes, linkedin). " +
  "Requires candidate_id. Preview first, then confirmed:true.";

export async function executeUpdateCandidate(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const candidateId = str(p.candidate_id) || str(p.id);
  if (!candidateId) {
    return { success: false, error: "candidate_id is required" };
  }

  const existing = await getLeadById(context.tenantId!, candidateId);
  if (!existing) {
    return { success: false, error: `Candidate not found: ${candidateId}` };
  }

  const updates: Record<string, unknown> = {};
  for (const key of [
    "name",
    "email",
    "phone",
    "title",
    "location",
    "notes",
    "source",
    "linkedin_url",
    "summary",
    "salary_requirements",
  ] as const) {
    const v = str(p[key]);
    if (v !== undefined) updates[key] = v;
  }
  if (str(p.linkedin) && !updates.linkedin_url) {
    updates.linkedin_url = str(p.linkedin);
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No fields to update. Provide at least one field." };
  }

  const preview = {
    candidate_id: candidateId,
    current: {
      name: existing.name,
      email: existing.email,
      status: existing.status,
    },
    changes: updates,
  };

  const gate = confirmGate(p, UPDATE_CANDIDATE_TOOL, preview);
  if (gate) return gate;

  try {
    const updated = await updateLead(context.tenantId!, candidateId, updates as any);
    return {
      success: true,
      data: {
        status: "updated",
        candidate: updated
          ? {
              id: updated.id,
              name: updated.name,
              email: updated.email,
              status: updated.status,
              title: updated.title,
            }
          : { id: candidateId },
        message: `Updated candidate ${existing.name}.`,
      },
      metadata: { action: UPDATE_CANDIDATE_TOOL, id: candidateId },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update candidate",
    };
  }
}

// ---------------------------------------------------------------------------
// update_candidate_stage (pipeline status on lead)
// ---------------------------------------------------------------------------

export const UPDATE_CANDIDATE_STAGE_TOOL = "update_candidate_stage";
export const UPDATE_CANDIDATE_STAGE_DESCRIPTION =
  "Change a candidate's pipeline stage/status (identification, outreach, conversation, presented, interview, accept, rejected). " +
  "Requires candidate_id and stage. Preview first, then confirmed:true.";

export async function executeUpdateCandidateStage(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const candidateId = str(p.candidate_id) || str(p.id);
  const stage = normalizeCandidateStage(str(p.stage) || str(p.status));
  if (!candidateId) return { success: false, error: "candidate_id is required" };
  if (!stage) {
    return {
      success: false,
      error: `Invalid stage. Use one of: ${PIPELINE_STAGES.join(", ")}`,
    };
  }

  const existing = await getLeadById(context.tenantId!, candidateId);
  if (!existing) {
    return { success: false, error: `Candidate not found: ${candidateId}` };
  }

  const preview = {
    candidate_id: candidateId,
    name: existing.name,
    from_stage: existing.status,
    to_stage: stage,
  };

  const gate = confirmGate(p, UPDATE_CANDIDATE_STAGE_TOOL, preview);
  if (gate) return gate;

  try {
    const updated = await updateLead(context.tenantId!, candidateId, {
      status: stage as any,
    });
    return {
      success: true,
      data: {
        status: "stage_updated",
        candidate: {
          id: candidateId,
          name: existing.name,
          status: updated?.status || stage,
        },
        message: `Moved ${existing.name} from ${existing.status} → ${stage}.`,
      },
      metadata: { action: UPDATE_CANDIDATE_STAGE_TOOL, id: candidateId },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update stage",
    };
  }
}

// ---------------------------------------------------------------------------
// create_company
// ---------------------------------------------------------------------------

export const CREATE_COMPANY_TOOL = "create_company";
export const CREATE_COMPANY_DESCRIPTION =
  "Create a company/client in the CRM. Requires name. Preview first, then confirmed:true.";

export async function executeCreateCompany(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const name = str(p.name) || str(p.company_name);
  if (!name) return { success: false, error: "name is required" };

  const preview = {
    name,
    industry: str(p.industry) || "",
    city: str(p.city) || "",
    state: str(p.state) || "",
    domain: str(p.domain) || str(p.website) || "",
    description: str(p.description) || "",
    status: str(p.status) || "identification",
  };

  const gate = confirmGate(p, CREATE_COMPANY_TOOL, preview);
  if (gate) return gate;

  try {
    const client = await createClient(context.tenantId!, {
      name: preview.name,
      industry: preview.industry,
      city: preview.city,
      state: preview.state,
      domain: preview.domain,
      description: preview.description,
      status: preview.status,
    });
    return {
      success: true,
      data: {
        status: "created",
        company: { id: client.id, name: client.name },
        message: `Created company ${client.name} (id: ${client.id}).`,
      },
      metadata: { action: CREATE_COMPANY_TOOL, id: client.id },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create company",
    };
  }
}

// ---------------------------------------------------------------------------
// update_company
// ---------------------------------------------------------------------------

export const UPDATE_COMPANY_TOOL = "update_company";
export const UPDATE_COMPANY_DESCRIPTION =
  "Update a company/client. Requires company_id. Preview first, then confirmed:true.";

export async function executeUpdateCompany(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const companyId = str(p.company_id) || str(p.id);
  if (!companyId) return { success: false, error: "company_id is required" };

  const existing = await getClientById(context.tenantId!, companyId);
  if (!existing) {
    return { success: false, error: `Company not found: ${companyId}` };
  }

  const updates: Record<string, unknown> = {};
  for (const key of [
    "name",
    "industry",
    "city",
    "state",
    "domain",
    "description",
    "status",
    "revenue",
    "employee_count",
  ] as const) {
    const v = p[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      updates[key] = typeof v === "number" ? v : String(v).trim();
    }
  }
  if (str(p.website) && !updates.domain) updates.domain = str(p.website);

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  const preview = {
    company_id: companyId,
    current_name: existing.name,
    changes: updates,
  };
  const gate = confirmGate(p, UPDATE_COMPANY_TOOL, preview);
  if (gate) return gate;

  try {
    const updated = await updateClient(context.tenantId!, companyId, updates);
    return {
      success: true,
      data: {
        status: "updated",
        company: { id: companyId, name: updated?.name || existing.name },
        message: `Updated company ${updated?.name || existing.name}.`,
      },
      metadata: { action: UPDATE_COMPANY_TOOL, id: companyId },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update company",
    };
  }
}

// ---------------------------------------------------------------------------
// create_contact (company contact → Contact Info list)
// ---------------------------------------------------------------------------

export const CREATE_CONTACT_TOOL = "create_contact";
export const CREATE_CONTACT_DESCRIPTION =
  "Add a person as a company contact (hiring manager / business contact). " +
  "These appear on Contact Info (/dashboard/contact-info), NOT Candidates. " +
  "Requires name + company_id OR company_name. Preview first, then confirmed:true.";

async function resolveCompanyId(
  tenantId: string,
  companyId?: string,
  companyName?: string
): Promise<{ id: string; name: string } | { error: string }> {
  if (companyId) {
    const c = await getClientById(tenantId, companyId);
    if (!c?.id) return { error: `Company not found: ${companyId}` };
    return { id: c.id, name: c.name || c.companyName || companyId };
  }
  if (companyName) {
    const all = await getAllClients(tenantId);
    const needle = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = all.find((c) => {
      const n = (c.name || c.companyName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return n === needle || n.includes(needle) || needle.includes(n);
    });
    if (!match?.id) {
      return {
        error: `No company matching "${companyName}". Create the company first or pass company_id.`,
      };
    }
    return { id: match.id, name: match.name || match.companyName || match.id };
  }
  return { error: "company_id or company_name is required" };
}

export async function executeCreateContact(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const name = str(p.name);
  if (!name) return { success: false, error: "name is required" };

  const companyId = str(p.company_id) || str(p.client_id);
  const companyName = str(p.company_name) || str(p.company);
  const resolved = await resolveCompanyId(
    context.tenantId!,
    companyId,
    companyName
  );
  if ("error" in resolved) {
    return { success: false, error: resolved.error };
  }

  const preview = {
    name,
    title: str(p.title) || "",
    email: str(p.email) || "",
    phone: str(p.phone) || "",
    company_id: resolved.id,
    company_name: resolved.name,
    isPrimary: p.is_primary === true || p.isPrimary === true || p.is_primary === "true",
    notes: str(p.notes) || "",
    destination: "Contact Info (company contact)",
  };

  const gate = confirmGate(p, CREATE_CONTACT_TOOL, preview);
  if (gate) return gate;

  try {
    const updated = await addContactToClient(context.tenantId!, resolved.id, {
      name: preview.name,
      title: preview.title,
      email: preview.email,
      phone: preview.phone,
      isPrimary: preview.isPrimary,
      notes: preview.notes,
    });
    const created = (updated.contacts || []).find(
      (c: any) =>
        c.name?.toLowerCase() === preview.name.toLowerCase() &&
        (!preview.email || c.email === preview.email.toLowerCase())
    );
    return {
      success: true,
      data: {
        status: "created",
        contact: {
          id: created?.id,
          name: preview.name,
          company_id: resolved.id,
          company_name: resolved.name,
        },
        message: `Added ${preview.name} as a contact at ${resolved.name}. They appear on Contact Info.`,
        url_hint: "/dashboard/contact-info",
      },
      metadata: { action: CREATE_CONTACT_TOOL, id: created?.id, company_id: resolved.id },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create contact",
    };
  }
}

// ---------------------------------------------------------------------------
// create_job
// ---------------------------------------------------------------------------

export const CREATE_JOB_TOOL = "create_job";
export const CREATE_JOB_DESCRIPTION =
  "Create a job requisition. Requires title and company_id (use create_company or internal_data first). " +
  "Preview first, then confirmed:true.";

export async function executeCreateJob(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const title = str(p.title);
  const companyId = str(p.company_id);
  if (!title) return { success: false, error: "title is required" };
  if (!companyId) {
    return {
      success: false,
      error: "company_id is required. Look up or create the company first.",
    };
  }

  const company = await getClientById(context.tenantId!, companyId);
  if (!company) {
    return { success: false, error: `Company not found: ${companyId}` };
  }

  const preview = {
    title,
    company_id: companyId,
    company_name: company.name || str(p.company_name) || "",
    location: str(p.location) || "",
    description: str(p.description) || "",
    salary_range: str(p.salary_range) || str(p.salaryRange) || "",
    employment_type: str(p.employment_type) || str(p.employmentType) || "Full-time",
    status: str(p.status) || "Open",
  };

  const gate = confirmGate(p, CREATE_JOB_TOOL, preview);
  if (gate) return gate;

  try {
    const job = await createJob(context.tenantId!, {
      title: preview.title,
      companyId: preview.company_id,
      companyName: preview.company_name,
      location: preview.location,
      description: preview.description,
      salaryRange: preview.salary_range,
      employmentType: preview.employment_type as any,
      status: (preview.status as any) || "Open",
    });
    return {
      success: true,
      data: {
        status: "created",
        job: {
          id: job.id,
          title: job.title,
          companyId: job.companyId,
          companyName: job.companyName,
        },
        message: `Created job "${job.title}" (id: ${job.id}).`,
      },
      metadata: { action: CREATE_JOB_TOOL, id: job.id },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create job",
    };
  }
}

// ---------------------------------------------------------------------------
// update_job
// ---------------------------------------------------------------------------

export const UPDATE_JOB_TOOL = "update_job";
export const UPDATE_JOB_DESCRIPTION =
  "Update a job (title, status Open/Paused/Filled/Lost/Closed, location, description, salary). " +
  "Requires job_id. Preview first, then confirmed:true.";

export async function executeUpdateJob(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const jobId = str(p.job_id) || str(p.id);
  if (!jobId) return { success: false, error: "job_id is required" };

  const existing = await getJobById(context.tenantId!, jobId);
  if (!existing) return { success: false, error: `Job not found: ${jobId}` };

  const updates: Record<string, unknown> = {};
  if (str(p.title)) updates.title = str(p.title);
  if (str(p.location)) updates.location = str(p.location);
  if (str(p.description)) updates.description = str(p.description);
  if (str(p.salary_range) || str(p.salaryRange)) {
    updates.salaryRange = str(p.salary_range) || str(p.salaryRange);
  }
  if (str(p.status)) updates.status = str(p.status);
  if (str(p.employment_type) || str(p.employmentType)) {
    updates.employmentType = str(p.employment_type) || str(p.employmentType);
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No fields to update" };
  }

  const preview = {
    job_id: jobId,
    current_title: existing.title,
    changes: updates,
  };
  const gate = confirmGate(p, UPDATE_JOB_TOOL, preview);
  if (gate) return gate;

  try {
    const updated = await updateJob(context.tenantId!, jobId, updates as any);
    return {
      success: true,
      data: {
        status: "updated",
        job: {
          id: jobId,
          title: updated?.title || existing.title,
          status: updated?.status || existing.status,
        },
        message: `Updated job "${updated?.title || existing.title}".`,
      },
      metadata: { action: UPDATE_JOB_TOOL, id: jobId },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update job",
    };
  }
}

// ---------------------------------------------------------------------------
// link_candidate_to_job
// ---------------------------------------------------------------------------

export const LINK_CANDIDATE_JOB_TOOL = "link_candidate_to_job";
export const LINK_CANDIDATE_JOB_DESCRIPTION =
  "Link a candidate to a job pipeline. Requires candidate_id and job_id. " +
  "Optional stage (sourced, contacted, interviewing, etc.). Preview first, then confirmed:true.";

export async function executeLinkCandidateToJob(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const candidateId = str(p.candidate_id);
  const jobId = str(p.job_id);
  if (!candidateId || !jobId) {
    return { success: false, error: "candidate_id and job_id are required" };
  }

  const [lead, job] = await Promise.all([
    getLeadById(context.tenantId!, candidateId),
    getJobById(context.tenantId!, jobId),
  ]);
  if (!lead) return { success: false, error: `Candidate not found: ${candidateId}` };
  if (!job) return { success: false, error: `Job not found: ${jobId}` };

  const stage = str(p.stage) || "sourced";
  const preview = {
    candidate_id: candidateId,
    candidate_name: lead.name,
    job_id: jobId,
    job_title: job.title,
    stage,
    notes: str(p.notes) || "",
  };

  const gate = confirmGate(p, LINK_CANDIDATE_JOB_TOOL, preview);
  if (gate) return gate;

  try {
    await linkCandidateToJob(context.tenantId!, jobId, {
      candidateId,
      candidateName: lead.name || "Unknown",
      candidateEmail: lead.email,
      stage,
      notes: preview.notes,
    });
    return {
      success: true,
      data: {
        status: "linked",
        ...preview,
        message: `Linked ${lead.name} to job "${job.title}" at stage ${stage}.`,
      },
      metadata: { action: LINK_CANDIDATE_JOB_TOOL },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to link candidate to job",
    };
  }
}

// ---------------------------------------------------------------------------
// update_job_candidate_stage
// ---------------------------------------------------------------------------

export const UPDATE_JOB_CANDIDATE_STAGE_TOOL = "update_job_candidate_stage";
export const UPDATE_JOB_CANDIDATE_STAGE_DESCRIPTION =
  "Change a candidate's stage on a specific job. Requires candidate_id, job_id, and stage. " +
  "Preview first, then confirmed:true.";

export async function executeUpdateJobCandidateStage(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const candidateId = str(p.candidate_id);
  const jobId = str(p.job_id);
  const stage = str(p.stage);
  if (!candidateId || !jobId || !stage) {
    return {
      success: false,
      error: "candidate_id, job_id, and stage are required",
    };
  }

  const job = await getJobById(context.tenantId!, jobId);
  if (!job) return { success: false, error: `Job not found: ${jobId}` };

  const linked = (job.candidates || []).find((c) => c.candidateId === candidateId);
  if (!linked) {
    return {
      success: false,
      error: "Candidate is not linked to this job. Use link_candidate_to_job first.",
    };
  }

  const preview = {
    candidate_id: candidateId,
    candidate_name: linked.candidateName,
    job_id: jobId,
    job_title: job.title,
    from_stage: linked.stage,
    to_stage: stage,
  };

  const gate = confirmGate(p, UPDATE_JOB_CANDIDATE_STAGE_TOOL, preview);
  if (gate) return gate;

  try {
    await updateCandidateStageInJob(context.tenantId!, jobId, {
      candidateId,
      stage: stage as any,
      notes: str(p.notes),
    });
    return {
      success: true,
      data: {
        status: "stage_updated",
        ...preview,
        message: `Updated ${linked.candidateName} on "${job.title}": ${linked.stage} → ${stage}.`,
      },
      metadata: { action: UPDATE_JOB_CANDIDATE_STAGE_TOOL },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update job candidate stage",
    };
  }
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

export const CRM_WRITE_TOOLS: Array<{
  name: string;
  description: string;
  execute: (params: ToolParams | unknown, context: ToolContext) => Promise<ToolResult>;
  schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}> = [
  {
    name: CREATE_CANDIDATE_TOOL,
    description: CREATE_CANDIDATE_DESCRIPTION,
    execute: executeCreateCandidate,
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name (required)" },
        email: { type: "string", description: "Email" },
        phone: { type: "string", description: "Phone" },
        title: { type: "string", description: "Job title" },
        location: { type: "string", description: "Location" },
        company: { type: "string", description: "Current company (stored in notes)" },
        status: { type: "string", description: "Pipeline stage (default identification)" },
        source: { type: "string", description: "Source (default general-ai)" },
        notes: { type: "string", description: "Notes" },
        linkedin_url: { type: "string", description: "LinkedIn URL" },
        confirmed: {
          type: "boolean",
          description: "false/omit = preview only; true = actually create after user confirms",
        },
      },
      required: ["name"],
    },
  },
  {
    name: UPDATE_CANDIDATE_TOOL,
    description: UPDATE_CANDIDATE_DESCRIPTION,
    execute: executeUpdateCandidate,
    schema: {
      type: "object",
      properties: {
        candidate_id: { type: "string", description: "Candidate/lead id" },
        name: { type: "string", description: "New name" },
        email: { type: "string", description: "New email" },
        phone: { type: "string", description: "New phone" },
        title: { type: "string", description: "New title" },
        location: { type: "string", description: "New location" },
        notes: { type: "string", description: "Notes (replaces)" },
        linkedin_url: { type: "string", description: "LinkedIn URL" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["candidate_id"],
    },
  },
  {
    name: UPDATE_CANDIDATE_STAGE_TOOL,
    description: UPDATE_CANDIDATE_STAGE_DESCRIPTION,
    execute: executeUpdateCandidateStage,
    schema: {
      type: "object",
      properties: {
        candidate_id: { type: "string", description: "Candidate id" },
        stage: {
          type: "string",
          description:
            "identification|outreach|conversation|presented|interview|accept|rejected",
        },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["candidate_id", "stage"],
    },
  },
  {
    name: CREATE_COMPANY_TOOL,
    description: CREATE_COMPANY_DESCRIPTION,
    execute: executeCreateCompany,
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Company name" },
        industry: { type: "string", description: "Industry" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State" },
        domain: { type: "string", description: "Website domain" },
        description: { type: "string", description: "Description" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["name"],
    },
  },
  {
    name: CREATE_CONTACT_TOOL,
    description: CREATE_CONTACT_DESCRIPTION,
    execute: executeCreateContact,
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact full name (required)" },
        company_id: {
          type: "string",
          description: "Company id (preferred). Or use company_name.",
        },
        company_name: {
          type: "string",
          description: "Company name to match if company_id unknown (e.g. Chick Fil-A)",
        },
        company: {
          type: "string",
          description: "Alias for company_name",
        },
        title: { type: "string", description: "Job title at the company" },
        email: { type: "string", description: "Work email" },
        phone: { type: "string", description: "Phone" },
        notes: { type: "string", description: "Notes" },
        is_primary: {
          type: "boolean",
          description: "Mark as primary contact for the company",
        },
        confirmed: {
          type: "boolean",
          description: "false/omit = preview only; true = actually create after user confirms",
        },
      },
      required: ["name"],
    },
  },
  {
    name: UPDATE_COMPANY_TOOL,
    description: UPDATE_COMPANY_DESCRIPTION,
    execute: executeUpdateCompany,
    schema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "Company id" },
        name: { type: "string", description: "Name" },
        industry: { type: "string", description: "Industry" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State" },
        domain: { type: "string", description: "Domain" },
        description: { type: "string", description: "Description" },
        status: { type: "string", description: "Status" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["company_id"],
    },
  },
  {
    name: CREATE_JOB_TOOL,
    description: CREATE_JOB_DESCRIPTION,
    execute: executeCreateJob,
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Job title" },
        company_id: { type: "string", description: "Company id (required)" },
        location: { type: "string", description: "Location" },
        description: { type: "string", description: "Description" },
        salary_range: { type: "string", description: "Salary range" },
        employment_type: {
          type: "string",
          description: "Full-time|Part-time|Contract|Internship",
        },
        status: { type: "string", description: "Open|Paused|Filled|Lost|Closed" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["title", "company_id"],
    },
  },
  {
    name: UPDATE_JOB_TOOL,
    description: UPDATE_JOB_DESCRIPTION,
    execute: executeUpdateJob,
    schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job id" },
        title: { type: "string", description: "Title" },
        location: { type: "string", description: "Location" },
        description: { type: "string", description: "Description" },
        salary_range: { type: "string", description: "Salary" },
        status: { type: "string", description: "Open|Paused|Filled|Lost|Closed" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["job_id"],
    },
  },
  {
    name: LINK_CANDIDATE_JOB_TOOL,
    description: LINK_CANDIDATE_JOB_DESCRIPTION,
    execute: executeLinkCandidateToJob,
    schema: {
      type: "object",
      properties: {
        candidate_id: { type: "string", description: "Candidate id" },
        job_id: { type: "string", description: "Job id" },
        stage: { type: "string", description: "Application stage (default sourced)" },
        notes: { type: "string", description: "Notes" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["candidate_id", "job_id"],
    },
  },
  {
    name: UPDATE_JOB_CANDIDATE_STAGE_TOOL,
    description: UPDATE_JOB_CANDIDATE_STAGE_DESCRIPTION,
    execute: executeUpdateJobCandidateStage,
    schema: {
      type: "object",
      properties: {
        candidate_id: { type: "string", description: "Candidate id" },
        job_id: { type: "string", description: "Job id" },
        stage: { type: "string", description: "New stage on this job" },
        notes: { type: "string", description: "Optional notes" },
        confirmed: { type: "boolean", description: "true to apply after user confirms" },
      },
      required: ["candidate_id", "job_id", "stage"],
    },
  },
];
