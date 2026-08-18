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
  updateClientContact,
  findCompanyByName,
  matchCompanyByName,
} from "../../db/repositories/client-repository";
import { phonesFromWorkAndMobile } from "../../contacts/phone";
import { confirmGateMessage } from "../crm-write-loop";
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

/** Bust Next.js path caches so server components see AI writes immediately */
async function revalidateCrmPaths(paths: string[] = []) {
  try {
    const { revalidatePath } = await import("next/cache");
    const defaults = [
      "/dashboard/companies",
      "/dashboard/contact-info",
      "/dashboard/candidates",
      "/dashboard/jobs",
      "/dashboard",
    ];
    for (const p of new Set([...defaults, ...paths])) {
      revalidatePath(p);
    }
  } catch {
    /* non-Next runtime */
  }
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
      message: confirmGateMessage(action),
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
  "Create a job-seeker on the Candidates list. " +
  "NOT for hiring managers, client contacts, or 'add a company page + primary contact'. " +
  "Use create_company_with_primary_contact (or create_company then create_contact) for those. " +
  "If the company already exists and the person should appear on Contacts, use create_contact — " +
  "this tool will NOT post them there. " +
  "ALWAYS call once without confirmed to preview, show the user, then call again with " +
  "confirmed:true after they agree. Requires name. Optional company is only a note, " +
  "it does NOT add them under Contacts.";

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
    const lead = await createLead(
      context.tenantId!,
      {
        name: preview.name,
        email: preview.email,
        phone: preview.phone,
        title: preview.title,
        location: preview.location,
        status: stage as any,
        source: preview.source,
        notes: notesParts.filter(Boolean).join("\n"),
        linkedin_url: preview.linkedin_url,
      },
      context.userId
        ? { userId: context.userId, email: context.email }
        : undefined,
    );

    await revalidateCrmPaths([
      "/dashboard/candidates",
      lead.id ? `/dashboard/candidates/${lead.id}` : "",
    ].filter(Boolean));

    const matchedCompany = preview.company
      ? await findCompanyByName(context.tenantId!, preview.company)
      : null;

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
        ...(matchedCompany
          ? {
              warning:
                `This is a candidate only. ${preview.name} is NOT on Contacts at ${matchedCompany.name}. ` +
                `Call create_contact with company_id=${matchedCompany.id} if they are a hiring manager.`,
              not_a_company_contact: true,
              existing_company_id: matchedCompany.id,
            }
          : {}),
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
  "Create a company/client in the CRM. Requires name. Preview first, then confirmed:true. " +
  "When creating from a website: call fetch_website first. " +
  "If fetch fails, only name+domain are allowed (set website_fetch_failed:true). " +
  "Never invent Brazil/São Paulo from letters \"br\" in a domain brand (structuralbr.com ≠ Brazil); " +
  "set page_supports_brazil:true only if page text confirms Brazil.";

export const CREATE_COMPANY_WITH_PRIMARY_CONTACT_TOOL =
  "create_company_with_primary_contact";
export const CREATE_COMPANY_WITH_PRIMARY_CONTACT_DESCRIPTION =
  "Create a client company and its primary company contact in Trio, or add the contact to the existing company if that company already exists (never create a duplicate). " +
  "Use for a complete company + primary contact workflow, including when the user pastes a LinkedIn /in/ URL after Apollo lookup. Preview first, then confirmed:true.";

export async function executeCreateCompanyWithPrimaryContact(
  params: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;
  const p = (params || {}) as Record<string, unknown>;
  const companyName = str(p.company_name) || str(p.company);
  const contactName = str(p.contact_name) || str(p.contact);
  if (!companyName) return { success: false, error: "company_name is required" };
  if (!contactName) return { success: false, error: "contact_name is required" };

  const existingCompany = await findCompanyByName(context.tenantId!, companyName);

  if (!isConfirmed(p)) {
    return {
      success: true,
      data: {
        status: "needs_confirmation",
        action: CREATE_COMPANY_WITH_PRIMARY_CONTACT_TOOL,
        message: confirmGateMessage(CREATE_COMPANY_WITH_PRIMARY_CONTACT_TOOL),
        preview: {
          company: {
            name: existingCompany?.name || companyName,
            id: existingCompany?.id,
            already_exists: !!existingCompany,
            domain: str(p.domain) || str(p.website) || "",
            industry: str(p.industry) || "",
            city: str(p.city) || "",
            state: str(p.state) || "",
          },
          primary_contact: {
            name: contactName,
            title: str(p.contact_title) || str(p.title) || "",
            email: str(p.contact_email) || str(p.email) || "",
            phone: str(p.contact_phone) || str(p.phone) || "",
          },
          note: existingCompany
            ? `Company already exists — will add ${contactName} to the existing record (no duplicate company).`
            : `Will create ${companyName} and add ${contactName} as primary contact.`,
        },
      },
      metadata: {
        needs_confirmation: true,
        action: CREATE_COMPANY_WITH_PRIMARY_CONTACT_TOOL,
      },
    };
  }

  let companyId = existingCompany?.id;
  let companyLabel = existingCompany?.name || companyName;

  if (!companyId) {
    const companyResult = await executeCreateCompany(
      { ...p, name: companyName, confirmed: true },
      context,
    );
    if (!companyResult.success) return companyResult;
    const company = (companyResult.data as any)?.company;
    if (!company?.id) return { success: false, error: "Company was created without an id" };
    companyId = company.id;
    companyLabel = company.name || companyName;
  }

  const contactResult = await executeCreateContact(
    {
      name: contactName,
      company_id: companyId,
      title: str(p.contact_title) || str(p.title),
      email: str(p.contact_email) || str(p.email),
      phone: str(p.contact_phone) || str(p.phone),
      work_phone: str(p.work_phone),
      mobile_phone: str(p.mobile_phone),
      notes: str(p.contact_notes) || str(p.notes),
      is_primary: true,
      confirmed: true,
    },
    context,
  );
  if (!contactResult.success) {
    return {
      success: false,
      error: `Company ${companyLabel} is on file, but the primary contact failed: ${contactResult.error || "unknown error"}`,
      metadata: { company_created: !existingCompany, company_id: companyId },
    };
  }
  const contactData = contactResult.data as { contact?: { id?: string } } | undefined;
  if (!contactData?.contact?.id) {
    return {
      success: false,
      error: `Company ${companyLabel} is on file, but ${contactName} was not posted to Contacts. Retry create_contact.`,
      metadata: { company_id: companyId },
    };
  }
  return {
    success: true,
    data: {
      status: "created",
      company: { id: companyId, name: companyLabel },
      primary_contact: contactResult.data,
      already_exists: !!existingCompany,
      message: existingCompany
        ? `Added ${contactName} as a contact at existing company ${companyLabel}. They appear under Contacts.`
        : `Created ${companyLabel} and added ${contactName} as its primary contact in Trio.`,
    },
    metadata: {
      action: CREATE_COMPANY_WITH_PRIMARY_CONTACT_TOOL,
      company_id: companyId,
      contact_id: contactData.contact.id,
    },
  };
}

export async function executeCreateCompany(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const name = str(p.name) || str(p.company_name);
  if (!name) return { success: false, error: "name is required" };

  const existingCompany = await findCompanyByName(context.tenantId!, name);
  if (existingCompany?.id) {
    const existingPreview = {
      name: existingCompany.name || name,
      id: existingCompany.id,
      already_exists: true,
      note: `Company already exists — will reuse ${existingCompany.name} (no duplicate).`,
    };
    const existingGate = confirmGate(p, CREATE_COMPANY_TOOL, existingPreview);
    if (existingGate) return existingGate;
    return {
      success: true,
      data: {
        status: "created",
        already_exists: true,
        company: { id: existingCompany.id, name: existingCompany.name },
        message: `Company ${existingCompany.name} already exists (id: ${existingCompany.id}). Reusing it.`,
      },
      metadata: { action: CREATE_COMPANY_TOOL, id: existingCompany.id },
    };
  }

  const domain = str(p.domain) || str(p.website) || "";
  let industry = str(p.industry) || "";
  let city = str(p.city) || "";
  let state = str(p.state) || "";
  let description = str(p.description) || "";
  const phone = str(p.phone) || "";

  const websiteFetchFailed =
    p.website_fetch_failed === true ||
    p.website_fetch_failed === "true" ||
    p.fetch_failed === true ||
    p.fetch_failed === "true" ||
    p.grounding === "failed";

  const pageSupportsBrazil =
    p.page_supports_brazil === true ||
    p.page_supports_brazil === "true" ||
    p.pageSupportsBrazil === true;

  // Import guards (inline require avoided — use static import at top)
  const {
    shouldRejectInferredBrazil,
    shouldRejectUngroundedCompanyFields,
  } = await import("@/lib/ai/company-from-website");

  const ungrounded = shouldRejectUngroundedCompanyFields({
    websiteFetchFailed,
    industry,
    city,
    state,
    description,
  });
  if (ungrounded.reject) {
    return {
      success: false,
      error: ungrounded.reason,
      metadata: {
        reason: "ungrounded_fields",
        hint: "Retry with only name + domain and website_fetch_failed:true, or re-run fetch_website successfully first.",
      },
    };
  }

  const brazilGate = shouldRejectInferredBrazil({
    domain,
    city,
    state,
    description,
    pageSupportsBrazil,
  });
  if (brazilGate.reject) {
    return {
      success: false,
      error: brazilGate.reason,
      metadata: {
        reason: "inferred_brazil_from_domain",
        domain,
        city,
        state,
      },
    };
  }

  // If fetch failed, force strip any residual invented fields
  if (websiteFetchFailed) {
    industry = "";
    city = "";
    state = "";
    description = "";
  }

  const preview = {
    name,
    industry,
    city,
    state,
    domain,
    phone,
    description,
    status: str(p.status) || "identification",
    ...(websiteFetchFailed
      ? { note: "Minimal record — website could not be read; no invented details." }
      : {}),
  };

  const gate = confirmGate(p, CREATE_COMPANY_TOOL, preview);
  if (gate) return gate;

  try {
    const client = await createClient(
      context.tenantId!,
      {
        name: preview.name,
        industry: preview.industry,
        city: preview.city,
        state: preview.state,
        domain: preview.domain,
        phone: preview.phone,
        description: preview.description,
        status: preview.status,
      },
      context.userId
        ? { userId: context.userId, email: context.email }
        : undefined,
    );
    await revalidateCrmPaths([
      "/dashboard/companies",
      client.id ? `/dashboard/companies/${client.id}` : "",
    ].filter(Boolean));
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
    "phone",
    "description",
    "status",
    "revenue",
    "employee_count",
    "company_size",
    "open_jobs_posted",
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
    await revalidateCrmPaths([
      "/dashboard/companies",
      `/dashboard/companies/${companyId}`,
      "/dashboard/contact-info",
    ]);
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
// create_contact (company contact → Contacts list)
// ---------------------------------------------------------------------------

export const CREATE_CONTACT_TOOL = "create_contact";
export const CREATE_CONTACT_DESCRIPTION =
  "Add a person as a company contact (hiring manager / business contact). " +
  "These appear on Contacts (/dashboard/contact-info), NOT Candidates. " +
  "Requires name + company_id OR company_name. Reuses the existing company — never creates a second company. " +
  "If the user says the company is there but the person is not on Contacts, call this (not internal_data lookup of invented ids). " +
  "Preview first, then confirmed:true.";

function findContactOnCompany(
  company: { contacts?: Array<Record<string, any>> } | null | undefined,
  name: string,
  email?: string
): Record<string, any> | undefined {
  const contacts = Array.isArray(company?.contacts) ? company!.contacts! : [];
  const wantName = name.toLowerCase().trim();
  const wantEmail = email ? email.toLowerCase().trim() : "";
  return contacts.find((c) => {
    const cn = String(c?.name || "").toLowerCase().trim();
    if (cn !== wantName) return false;
    if (wantEmail && c?.email && String(c.email).toLowerCase() !== wantEmail) {
      return false;
    }
    return true;
  });
}

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
    const match = matchCompanyByName(all, companyName);
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

  const workPhone = str(p.work_phone) || str(p.workPhone) || "";
  const mobilePhone =
    str(p.mobile_phone) ||
    str(p.mobilePhone) ||
    str(p.cell_phone) ||
    str(p.cellPhone) ||
    "";
  const legacyPhone = str(p.phone) || "";
  const phones = phonesFromWorkAndMobile({
    workPhone,
    mobilePhone,
    phone: legacyPhone,
  });

  const preview = {
    name,
    title: str(p.title) || "",
    email: str(p.email) || "",
    phone: phones[0]?.number || legacyPhone,
    work_phone: workPhone || undefined,
    mobile_phone: mobilePhone || undefined,
    company_id: resolved.id,
    company_name: resolved.name,
    isPrimary: p.is_primary === true || p.isPrimary === true || p.is_primary === "true",
    notes: str(p.notes) || "",
    destination: "Contacts (company contact)",
  };

  const existingOnCompany = await getClientById(context.tenantId!, resolved.id);
  const already = findContactOnCompany(
    existingOnCompany,
    preview.name,
    preview.email
  );
  if (already?.id) {
    const existingGate = confirmGate(p, CREATE_CONTACT_TOOL, {
      ...preview,
      contact_id: already.id,
      already_exists: true,
      note: `${preview.name} is already a contact at ${resolved.name}.`,
    });
    if (existingGate) return existingGate;
    return {
      success: true,
      data: {
        status: "created",
        already_exists: true,
        contact: {
          id: already.id,
          name: already.name || preview.name,
          company_id: resolved.id,
          company_name: resolved.name,
        },
        message: `${preview.name} is already a contact at ${resolved.name}.`,
        url_hint: "/dashboard/contact-info",
      },
      metadata: {
        action: CREATE_CONTACT_TOOL,
        id: already.id,
        company_id: resolved.id,
      },
    };
  }

  const gate = confirmGate(p, CREATE_CONTACT_TOOL, preview);
  if (gate) return gate;

  try {
    const updated = await addContactToClient(
      context.tenantId!,
      resolved.id,
      {
        name: preview.name,
        title: preview.title,
        email: preview.email,
        phones,
        phone: preview.phone,
        isPrimary: preview.isPrimary,
        notes: preview.notes,
      },
      context.userId
        ? { userId: context.userId, email: context.email }
        : undefined,
    );
    const created =
      findContactOnCompany(updated, preview.name, preview.email) ||
      findContactOnCompany(
        await getClientById(context.tenantId!, resolved.id),
        preview.name,
        preview.email
      );
    if (!created?.id) {
      return {
        success: false,
        error:
          `Contact write did not persist on ${resolved.name}. ` +
          `The company is there; retry create_contact. Do not invent a contact id.`,
        metadata: { company_id: resolved.id },
      };
    }
    await revalidateCrmPaths([
      "/dashboard/contact-info",
      "/dashboard/companies",
      `/dashboard/companies/${resolved.id}`,
      `/dashboard/contact-info/${created.id}`,
    ]);
    return {
      success: true,
      data: {
        status: "created",
        contact: {
          id: created.id,
          name: preview.name,
          company_id: resolved.id,
          company_name: resolved.name,
        },
        message: `Added ${preview.name} as a contact at ${resolved.name}. They appear under Contacts.`,
        url_hint: "/dashboard/contact-info",
      },
      metadata: { action: CREATE_CONTACT_TOOL, id: created.id, company_id: resolved.id },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create contact",
    };
  }
}

// ---------------------------------------------------------------------------
// update_contact (company contact on Contacts)
// ---------------------------------------------------------------------------

export const UPDATE_CONTACT_TOOL = "update_contact";
export const UPDATE_CONTACT_DESCRIPTION =
  "Update an existing company contact (hiring manager / Contacts person). " +
  "Requires contact_id. Prefer company_id when known; otherwise the contact is located by id across companies. " +
  "Supports work_phone and mobile_phone (or phone). Preview first, then confirmed:true. " +
  "After success, the CRM lists refresh — there is no intentional delay.";

async function findContactAcrossCompanies(
  tenantId: string,
  contactId: string,
  companyIdHint?: string
): Promise<
  | { companyId: string; companyName: string; contact: any }
  | { error: string }
> {
  if (companyIdHint) {
    const company = await getClientById(tenantId, companyIdHint);
    if (!company?.id) {
      return { error: `Company not found: ${companyIdHint}` };
    }
    const contact = (company.contacts || []).find(
      (c: any) => String(c.id) === String(contactId)
    );
    if (!contact) {
      return {
        error: `Contact ${contactId} not found on company ${companyIdHint}`,
      };
    }
    return {
      companyId: company.id,
      companyName: company.name || company.companyName || company.id,
      contact,
    };
  }

  const all = await getAllClients(tenantId);
  for (const company of all) {
    const contact = (company.contacts || []).find(
      (c: any) => String(c.id) === String(contactId)
    );
    if (contact && company.id) {
      return {
        companyId: company.id,
        companyName: company.name || company.companyName || company.id,
        contact,
      };
    }
  }
  return { error: `Contact not found: ${contactId}` };
}

export async function executeUpdateContact(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const deny = needTenant(context);
  if (deny) return deny;

  const p = (params || {}) as Record<string, unknown>;
  const contactId = str(p.contact_id) || str(p.contactId) || str(p.id);
  if (!contactId) {
    return {
      success: false,
      error: "contact_id is required to update a contact",
    };
  }

  const companyIdHint = str(p.company_id) || str(p.client_id);
  const located = await findContactAcrossCompanies(
    context.tenantId!,
    contactId,
    companyIdHint
  );
  if ("error" in located) {
    return { success: false, error: located.error };
  }

  const workPhone = str(p.work_phone) || str(p.workPhone);
  const mobilePhone =
    str(p.mobile_phone) ||
    str(p.mobilePhone) ||
    str(p.cell_phone) ||
    str(p.cellPhone);
  const legacyPhone = str(p.phone);

  const hasPhoneUpdate =
    workPhone !== undefined ||
    mobilePhone !== undefined ||
    legacyPhone !== undefined;

  let phones: ReturnType<typeof phonesFromWorkAndMobile> | undefined;
  if (hasPhoneUpdate) {
    // Merge with existing so partial phone updates do not wipe the other number
    const existingPhones = Array.isArray(located.contact.phones)
      ? located.contact.phones
      : [];
    const existingWork =
      existingPhones.find((x: any) =>
        ["work", "office"].includes(String(x?.type || "").toLowerCase())
      )?.number ||
      (String(located.contact.preferredPhoneType || "").toLowerCase() === "work"
        ? located.contact.preferredPhone || located.contact.phone
        : "") ||
      "";
    const existingMobile =
      existingPhones.find((x: any) =>
        ["mobile", "cell"].includes(String(x?.type || "").toLowerCase())
      )?.number || "";

    phones = phonesFromWorkAndMobile({
      workPhone: workPhone !== undefined ? workPhone : existingWork,
      mobilePhone: mobilePhone !== undefined ? mobilePhone : existingMobile,
      phone: legacyPhone,
    });
  }

  const preview: Record<string, unknown> = {
    contact_id: contactId,
    company_id: located.companyId,
    company_name: located.companyName,
    current_name: located.contact.name,
  };
  if (str(p.name)) preview.name = str(p.name);
  if (str(p.title)) preview.title = str(p.title);
  if (str(p.email)) preview.email = str(p.email);
  if (workPhone !== undefined) preview.work_phone = workPhone;
  if (mobilePhone !== undefined) preview.mobile_phone = mobilePhone;
  if (legacyPhone !== undefined && workPhone === undefined && mobilePhone === undefined) {
    preview.phone = legacyPhone;
  }
  if (str(p.notes) !== undefined) preview.notes = str(p.notes) || "";
  if (str(p.linkedin_url) || str(p.linkedin)) {
    preview.linkedin_url = str(p.linkedin_url) || str(p.linkedin);
  }
  if (
    p.is_primary === true ||
    p.isPrimary === true ||
    p.is_primary === "true" ||
    p.is_primary === false ||
    p.isPrimary === false
  ) {
    preview.is_primary =
      p.is_primary === true || p.isPrimary === true || p.is_primary === "true";
  }

  const gate = confirmGate(p, UPDATE_CONTACT_TOOL, preview);
  if (gate) return gate;

  try {
    const patch: Record<string, unknown> = {};
    if (str(p.name)) patch.name = str(p.name);
    if (str(p.title) !== undefined) patch.title = str(p.title) || "";
    if (str(p.email) !== undefined) patch.email = str(p.email) || "";
    if (str(p.notes) !== undefined) patch.notes = str(p.notes) || "";
    if (str(p.linkedin_url) || str(p.linkedin)) {
      patch.linkedin_url = str(p.linkedin_url) || str(p.linkedin) || "";
    }
    if (preview.is_primary !== undefined) {
      patch.isPrimary = !!preview.is_primary;
    }
    if (phones) {
      patch.phones = phones;
      patch.phone = phones[0]?.number || "";
    } else if (legacyPhone !== undefined) {
      patch.phone = legacyPhone;
    }

    const updated = await updateClientContact(
      context.tenantId!,
      located.companyId,
      contactId,
      patch as any
    );
    if (!updated) {
      return { success: false, error: "Failed to update contact — not found" };
    }

    const refreshed = (updated.contacts || []).find(
      (c: any) => String(c.id) === String(contactId)
    );

    await revalidateCrmPaths([
      "/dashboard/contact-info",
      `/dashboard/contact-info/${contactId}`,
      "/dashboard/companies",
      `/dashboard/companies/${located.companyId}`,
    ]);

    return {
      success: true,
      data: {
        status: "updated",
        contact: {
          id: contactId,
          name: refreshed?.name || str(p.name) || located.contact.name,
          company_id: located.companyId,
          company_name: located.companyName,
          title: refreshed?.title,
          email: refreshed?.email,
          phone: refreshed?.phone || refreshed?.preferredPhone,
          phones: refreshed?.phones,
        },
        message: `Updated contact ${refreshed?.name || contactId}. Changes appear immediately under Contacts (refresh if a tab was already open).`,
        url_hint: `/dashboard/contact-info/${contactId}`,
      },
      metadata: {
        action: UPDATE_CONTACT_TOOL,
        id: contactId,
        company_id: located.companyId,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update contact",
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
    const job = await createJob(
      context.tenantId!,
      {
        title: preview.title,
        companyId: preview.company_id,
        companyName: preview.company_name,
        location: preview.location,
        description: preview.description,
        salaryRange: preview.salary_range,
        employmentType: preview.employment_type as any,
        status: (preview.status as any) || "Open",
      },
      context.userId
        ? { userId: context.userId, email: context.email }
        : undefined,
    );
    await revalidateCrmPaths([
      "/dashboard/jobs",
      job.id ? `/dashboard/jobs/${job.id}` : "",
      companyId ? `/dashboard/companies/${companyId}` : "",
    ].filter(Boolean));
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
    name: CREATE_COMPANY_WITH_PRIMARY_CONTACT_TOOL,
    description: CREATE_COMPANY_WITH_PRIMARY_CONTACT_DESCRIPTION,
    execute: executeCreateCompanyWithPrimaryContact,
    schema: {
      type: "object",
      properties: {
        company_name: { type: "string", description: "Client/company name" },
        domain: { type: "string", description: "Company website/domain" },
        industry: { type: "string", description: "Industry, only if grounded" },
        city: { type: "string", description: "City, only if grounded" },
        state: { type: "string", description: "State, only if grounded" },
        contact_name: { type: "string", description: "Primary contact full name" },
        contact_title: { type: "string", description: "Primary contact title" },
        contact_email: { type: "string", description: "Primary contact email" },
        contact_phone: { type: "string", description: "Primary contact phone" },
        work_phone: { type: "string", description: "Primary contact work phone" },
        mobile_phone: { type: "string", description: "Primary contact mobile phone" },
        contact_notes: { type: "string", description: "Primary contact notes" },
        confirmed: { type: "boolean", description: "true to create after preview" },
      },
      required: ["company_name", "contact_name"],
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
        industry: {
          type: "string",
          description:
            "Industry — only from page text. Empty if website_fetch_failed.",
        },
        city: {
          type: "string",
          description:
            "City — only if on page. Never São Paulo from 'br' in domain brand.",
        },
        state: {
          type: "string",
          description:
            "State — only if on page. Never Brazil from structuralbr-style domains.",
        },
        domain: { type: "string", description: "Website domain" },
        phone: { type: "string", description: "Main company phone number" },
        description: {
          type: "string",
          description:
            "Description — only from page text. Empty if fetch failed.",
        },
        website_fetch_failed: {
          type: "boolean",
          description:
            "true if fetch_website failed — only name+domain allowed then",
        },
        page_supports_brazil: {
          type: "boolean",
          description:
            "true ONLY if fetch_website page text confirms Brazil (not domain letters)",
        },
        confirmed: {
          type: "boolean",
          description: "true to apply after user confirms",
        },
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
        phone: {
          type: "string",
          description:
            "Phone (legacy single field). Prefer work_phone / mobile_phone when both known.",
        },
        work_phone: {
          type: "string",
          description: "Direct / office work phone number",
        },
        mobile_phone: {
          type: "string",
          description: "Cell / mobile phone (often used by hiring managers)",
        },
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
    name: UPDATE_CONTACT_TOOL,
    description: UPDATE_CONTACT_DESCRIPTION,
    execute: executeUpdateContact,
    schema: {
      type: "object",
      properties: {
        contact_id: {
          type: "string",
          description: "Contact id (required)",
        },
        company_id: {
          type: "string",
          description: "Company id (recommended for faster lookup)",
        },
        name: { type: "string", description: "Full name" },
        title: { type: "string", description: "Job title" },
        email: { type: "string", description: "Email" },
        phone: {
          type: "string",
          description:
            "Single phone (legacy). Prefer work_phone and mobile_phone.",
        },
        work_phone: {
          type: "string",
          description: "Direct / office work phone",
        },
        mobile_phone: {
          type: "string",
          description: "Cell / mobile phone",
        },
        notes: { type: "string", description: "Notes" },
        linkedin_url: { type: "string", description: "LinkedIn profile URL" },
        is_primary: {
          type: "boolean",
          description: "Mark as primary contact for the company",
        },
        confirmed: {
          type: "boolean",
          description: "true to apply after user confirms",
        },
      },
      required: ["contact_id"],
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
        phone: { type: "string", description: "Main company phone number" },
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
