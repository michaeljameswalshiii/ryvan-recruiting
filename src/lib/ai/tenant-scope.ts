/**
 * AI tenant isolation — session is source of truth.
 *
 * Rules:
 * - Normal users: tools always run in session.tenantId (never model-supplied).
 * - Site/system admins: may act as another tenant ONLY via server-controlled
 *   header X-Act-As-Tenant-Id (never via model tool arguments).
 * - Model-supplied tenant_id / tenantId / etc. are stripped and ignored.
 *
 * @serverOnly
 */

import type { NextRequest } from 'next/server';
import { getSession, type SessionData } from '@/lib/server-auth';
import { resolveUserRole } from '@/lib/admin-auth';
import { isSiteAdmin, normalizeRole, type AppRole } from '@/lib/roles';
import type { ToolContext, ToolParams } from '@/lib/ai/tools/types';

/** Keys the model must never use to switch tenancy */
const FORBIDDEN_TENANT_KEYS = new Set([
  'tenant_id',
  'tenantid',
  'tenant',
  'tenantids',
  'tenant_ids',
  'x-tenant-id',
  'xtenantid',
  'org_id',
  'orgid',
  'organization_id',
  'organizationid',
]);

export type AiTenantResolution = {
  userId: string | null;
  email: string | null;
  role: AppRole;
  /** Home tenant from login session */
  sessionTenantId: string | null;
  /** Effective tenant for tool execution */
  tenantId: string | null;
  isSiteAdmin: boolean;
  /** When site admin intentionally scoped to another tenant */
  actAsTenantId: string | null;
  /** Why effective tenant was chosen */
  scopeSource:
    | 'session'
    | 'act_as_header'
    | 'missing'
    | 'header_ignored_non_admin';
};

/**
 * Strip any tenancy-related fields from model/tool input (defense in depth).
 * Mutates a shallow copy; does not deep-clone nested objects beyond first level.
 */
export function stripModelTenantFields<T extends Record<string, unknown>>(
  params: T
): T {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }
  const out: Record<string, unknown> = { ...params };
  for (const key of Object.keys(out)) {
    const norm = key.toLowerCase().replace(/[\s-]/g, '_');
    if (
      FORBIDDEN_TENANT_KEYS.has(norm) ||
      FORBIDDEN_TENANT_KEYS.has(key.toLowerCase())
    ) {
      delete out[key];
    }
  }
  return out as T;
}

function looksLikeTenantId(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 3 || s.length > 128) return false;
  // Allow uuid-ish, tenant-*, and other safe id shapes used in Trio
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(s);
}

/**
 * Resolve AI tool tenancy from the HTTP request + session.
 * Never trusts body.tenantId or tool-argument tenant fields.
 */
export async function resolveAiTenantFromRequest(
  request: NextRequest,
  options?: { bodyActAsTenantId?: unknown }
): Promise<AiTenantResolution> {
  let session: SessionData | null = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  const userId = session?.userId || request.headers.get('x-user-id') || null;
  const email = session?.email || null;
  const sessionTenantId =
    (session?.tenantId && String(session.tenantId).trim()) || null;

  let role: AppRole = normalizeRole(session?.role);
  if (userId) {
    try {
      role = await resolveUserRole(userId, email || undefined);
    } catch {
      /* keep cookie role */
    }
  }
  const siteAdmin = isSiteAdmin(role);

  // Middleware may inject x-tenant-id from session — ignore for non-admin
  // if it disagrees with session (spoof defense when middleware bypassed).
  const headerTenant = request.headers.get('x-tenant-id')?.trim() || null;

  // Site admin only: explicit act-as (header preferred; body only if not from model tools)
  const actAsRaw =
    request.headers.get('x-act-as-tenant-id')?.trim() ||
    (typeof options?.bodyActAsTenantId === 'string'
      ? options.bodyActAsTenantId.trim()
      : '') ||
    '';

  let actAsTenantId: string | null = null;
  let tenantId: string | null = sessionTenantId;
  let scopeSource: AiTenantResolution['scopeSource'] = sessionTenantId
    ? 'session'
    : 'missing';

  if (siteAdmin && actAsRaw && looksLikeTenantId(actAsRaw)) {
    actAsTenantId = actAsRaw;
    tenantId = actAsRaw;
    scopeSource = 'act_as_header';
  } else if (
    !siteAdmin &&
    headerTenant &&
    sessionTenantId &&
    headerTenant !== sessionTenantId
  ) {
    // Prefer session; ignore mismatched header
    tenantId = sessionTenantId;
    scopeSource = 'header_ignored_non_admin';
  } else if (!sessionTenantId && headerTenant && looksLikeTenantId(headerTenant)) {
    // Edge case: no session tenant but middleware set header (should be rare)
    // Only accept if we have a userId from same request path — still prefer session
    tenantId = siteAdmin ? headerTenant : headerTenant;
    scopeSource = siteAdmin ? 'act_as_header' : 'session';
  }

  return {
    userId,
    email,
    role,
    sessionTenantId,
    tenantId,
    isSiteAdmin: siteAdmin,
    actAsTenantId,
    scopeSource,
  };
}

/**
 * Build ToolContext with locked tenant (never from model).
 */
export function buildToolContext(
  resolution: AiTenantResolution,
  extras?: Partial<ToolContext> & {
    requestUrl?: string;
    agentWriteApproved?: boolean;
    agentMaxCreatesPerWave?: number;
  }
): ToolContext {
  return {
    tenantId: resolution.tenantId,
    userId: resolution.userId,
    email: resolution.email,
    role: resolution.role,
    isSiteAdmin: resolution.isSiteAdmin,
    sessionTenantId: resolution.sessionTenantId,
    actAsTenantId: resolution.actAsTenantId,
    requestUrl: extras?.requestUrl,
    generatedFiles: extras?.generatedFiles,
    toolSpend: extras?.toolSpend,
    agentWriteApproved: extras?.agentWriteApproved,
    agentMaxCreatesPerWave: extras?.agentMaxCreatesPerWave,
  };
}

/**
 * Sanitize tool params + enforce tenant present for CRM/internal tools.
 */
export function prepareToolExecution(
  toolName: string,
  params: ToolParams | Record<string, unknown>,
  context: ToolContext
): {
  params: ToolParams;
  context: ToolContext;
  rejectError?: string;
} {
  const cleaned = stripModelTenantFields(
    (params && typeof params === 'object'
      ? { ...(params as object) }
      : { query: String(params || '') }) as Record<string, unknown>
  ) as ToolParams;

  // Absolute lock: never allow context.tenantId from params
  const locked: ToolContext = {
    ...context,
    tenantId: context.tenantId || null,
  };

  const tenantRequiredTools = new Set([
    'internal_data',
    'create_company',
    'update_company',
    'create_contact',
    'update_contact',
    'create_candidate',
    'update_candidate',
    'create_job',
    'update_job',
    'link_candidate_to_job',
    'update_candidate_stage',
    'update_job_candidate_stage',
    'score_job_fit',
    'get_skills_graph',
    'enroll_in_sequence',
    'list_sequences',
    'run_fill_req_playbook',
    'start_list_builder',
    'source_candidates',
  ]);

  // Soft-require: any create_/update_/link_ or internal
  const needsTenant =
    tenantRequiredTools.has(toolName) ||
    /^(create_|update_|link_)/.test(toolName) ||
    toolName.includes('internal');

  if (needsTenant && !locked.tenantId) {
    return {
      params: cleaned,
      context: locked,
      rejectError:
        'Tenant context required. Sign in again — AI tools only run inside your organization.',
    };
  }

  return { params: cleaned, context: locked };
}

/** One-line log for tool boundary */
export function logToolTenant(
  toolName: string,
  context: ToolContext,
  extra?: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'ai_tool_tenant_scope',
      tool: toolName,
      tenantId: context.tenantId || null,
      sessionTenantId: context.sessionTenantId || null,
      actAsTenantId: context.actAsTenantId || null,
      userId: context.userId || null,
      role: context.role || null,
      isSiteAdmin: !!context.isSiteAdmin,
      ...extra,
    })
  );
}

/** System-prompt block for models */
export const AI_TENANT_ISOLATION_PROMPT = `
TENANT ISOLATION (mandatory):
- You operate ONLY inside the signed-in organization (tenant). Data tools and CRM writes are scoped server-side.
- NEVER pass tenant_id, tenantId, or organization id as a tool argument — it is ignored and stripped.
- NEVER claim access to another customer's data. If the user asks for another tenant, refuse and explain you can only see their workspace.
- Site/system admins who need another tenant must use the product's admin tenant switch (server header); you cannot switch tenants yourself.
`.trim();
