/**
 * Internal Data Tool
 *
 * Access tenant's own data (leads, clients, contacts, pipeline, jobs).
 * Uses repositories directly for proper tenant isolation.
 *
 * @serverOnly
 */

import { ToolResult, ToolContext } from './types';
import { getAllLeads, getLeadById } from '../../db/repositories/lead-repository';
import {
  getAllClients,
  getClientById,
} from '../../db/repositories/client-repository';
import {
  getAllPipeline,
  getPipelineById,
} from '../../db/repositories/pipeline-repository';
import { getAllJobs, getJobById } from '../../db/repositories/job-repository';
import {
  getAllContactsForTenant,
  getContactById,
  getContactsForCompany,
} from '../../db/repositories/contact-repository';
import { getDisplayPhone } from '../../contacts/phone';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal data types
 */
export type InternalDataType =
  | 'leads'
  | 'clients'
  | 'pipeline'
  | 'jobs'
  | 'candidates'
  | 'contacts';

/**
 * Internal data actions
 */
export type InternalDataAction = 'list' | 'get';

/**
 * Optional filters for list (especially contacts / candidates)
 */
export type InternalDataFilter =
  | 'all'
  | 'missing_email'
  | 'has_email'
  | 'missing_phone'
  | 'has_phone';

/**
 * Tool metadata
 */
export const INTERNAL_TOOL_NAME = 'internal_data';
export const INTERNAL_TOOL_DESCRIPTION =
  'Read your organization ATS data: leads/candidates, clients/companies, contacts (hiring managers / Contact Info), jobs, pipeline. ' +
  'Use list or get (with id). For contacts, filter missing_email finds people without an email. ' +
  'Requires sign-in. Read-only — use create_* / update_* tools to change data.';

/**
 * Internal data input parameters
 */
export interface InternalDataParams {
  data_type: InternalDataType;
  action: InternalDataAction;
  id?: string;
  /** When getting a contact, company_id helps resolve the record */
  company_id?: string;
  /**
   * List filter:
   * - missing_email | has_email | missing_phone | has_phone | all
   * Especially useful for contacts (and candidates).
   */
  filter?: InternalDataFilter | string;
  /** Alias: true → filter missing_email */
  missing_email?: boolean;
  /** Limit company contacts to one company */
  company_id_filter?: string;
}

function hasEmail(email?: string | null): boolean {
  return !!(email && String(email).trim());
}

function hasPhone(phone?: string | null): boolean {
  return !!(phone && String(phone).trim());
}

function resolveFilter(input: InternalDataParams): InternalDataFilter {
  if (input.missing_email === true) return 'missing_email';
  const f = String(input.filter || 'all')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (
    f === 'missing_email' ||
    f === 'no_email' ||
    f === 'without_email' ||
    f === 'blank_email'
  ) {
    return 'missing_email';
  }
  if (f === 'has_email' || f === 'with_email') return 'has_email';
  if (
    f === 'missing_phone' ||
    f === 'no_phone' ||
    f === 'without_phone'
  ) {
    return 'missing_phone';
  }
  if (f === 'has_phone' || f === 'with_phone') return 'has_phone';
  return 'all';
}

function applyPersonFilter<T extends { email?: string; phone?: string }>(
  rows: T[],
  filter: InternalDataFilter
): T[] {
  switch (filter) {
    case 'missing_email':
      return rows.filter((r) => !hasEmail(r.email));
    case 'has_email':
      return rows.filter((r) => hasEmail(r.email));
    case 'missing_phone':
      return rows.filter((r) => !hasPhone(r.phone));
    case 'has_phone':
      return rows.filter((r) => hasPhone(r.phone));
    default:
      return rows;
  }
}

/**
 * Execute internal data access
 *
 * @param params - Data access parameters
 * @param context - Tool execution context (MUST include tenantId)
 * @returns ToolResult with data or error
 */
export async function executeInternalData(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  // Parse input
  const input = params as InternalDataParams;

  // ENFORCE TENANT ISOLATION - Never allow without tenantId
  if (!context.tenantId) {
    return {
      success: false,
      error: 'Tenant context required for internal data access',
      metadata: { reason: 'no_tenant' },
    };
  }

  // Validate data type (candidates is alias for leads)
  const validTypes: InternalDataType[] = [
    'leads',
    'candidates',
    'clients',
    'contacts',
    'pipeline',
    'jobs',
  ];
  if (!input.data_type || !validTypes.includes(input.data_type)) {
    return {
      success: false,
      error: `Invalid data type. Must be one of: ${validTypes.join(', ')}`,
    };
  }
  const dataType =
    input.data_type === 'candidates' ? 'leads' : input.data_type;

  // Validate action
  const validActions: InternalDataAction[] = ['list', 'get'];
  if (!input.action || !validActions.includes(input.action)) {
    return {
      success: false,
      error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
    };
  }

  // If getting by ID, require ID
  if (input.action === 'get' && !input.id) {
    return {
      success: false,
      error: 'ID required for get action',
    };
  }

  try {
    const tenantId = context.tenantId;
    const filter = resolveFilter(input);
    let data: unknown;

    switch (dataType) {
      case 'leads':
        if (input.action === 'list') {
          const leads = await getAllLeads(tenantId);
          const compact = Array.isArray(leads)
            ? leads.map((l) => ({
                id: l.id,
                name: l.name,
                email: l.email || '',
                title: l.title,
                status: l.status,
                phone: l.phone || '',
                location: l.location,
              }))
            : [];
          const filtered = applyPersonFilter(compact, filter);
          data = {
            entity: 'candidates',
            filter,
            total: filtered.length,
            returned: Math.min(filtered.length, 100),
            records: filtered.slice(0, 100),
          };
        } else {
          data = await getLeadById(tenantId, input.id!);
        }
        break;

      case 'clients':
        if (input.action === 'list') {
          const clients = await getAllClients(tenantId);
          data = Array.isArray(clients)
            ? clients.slice(0, 80).map((c) => ({
                id: c.id,
                name: c.name,
                industry: c.industry,
                city: c.city,
                state: c.state,
                status: c.status,
                contactCount: Array.isArray(c.contacts) ? c.contacts.length : 0,
              }))
            : [];
        } else {
          data = await getClientById(tenantId, input.id!);
        }
        break;

      case 'contacts': {
        if (input.action === 'list') {
          let contacts = await getAllContactsForTenant(tenantId);
          const companyFilter =
            input.company_id || input.company_id_filter || undefined;
          if (companyFilter) {
            contacts = contacts.filter(
              (c) => String(c.companyId) === String(companyFilter)
            );
          }
          const compact = contacts.map((c) => {
            const phone = getDisplayPhone(c) || c.phone || '';
            return {
              id: c.id,
              name: c.name,
              email: c.email || '',
              title: c.title || '',
              phone,
              companyId: c.companyId || '',
              companyName: c.companyName || '',
              isPrimary: !!c.isPrimary,
              hasEmail: hasEmail(c.email),
              hasPhone: hasPhone(phone),
            };
          });
          const filtered = applyPersonFilter(compact, filter);
          data = {
            entity: 'contacts',
            description:
              'Company contacts / hiring managers (Contact Info) — not candidates',
            filter,
            companyId: companyFilter || null,
            total: filtered.length,
            returned: Math.min(filtered.length, 150),
            records: filtered.slice(0, 150),
          };
        } else {
          // get by contact id — try with company_id, else search tenant list
          const contactId = input.id!;
          let found = null as Awaited<
            ReturnType<typeof getContactById>
          > | null;
          if (input.company_id) {
            found = await getContactById(
              tenantId,
              input.company_id,
              contactId
            );
          }
          if (!found) {
            const all = await getAllContactsForTenant(tenantId);
            const row = all.find((c) => c.id === contactId);
            if (row) {
              found = row;
            }
          }
          if (!found && input.company_id) {
            const list = await getContactsForCompany(
              tenantId,
              input.company_id
            );
            found = list.find((c) => c.id === contactId) || null;
          }
          data = found || {
            error: 'Contact not found',
            id: contactId,
            hint:
              'This id is not on Contacts. Do not invent contact ids. ' +
              'If the company exists, call create_contact with name + company_name (or company_id).',
          };
        }
        break;
      }

      case 'jobs':
        if (input.action === 'list') {
          const jobs = await getAllJobs(tenantId);
          data = Array.isArray(jobs)
            ? jobs.slice(0, 80).map((j) => ({
                id: j.id,
                title: j.title,
                companyId: j.companyId,
                companyName: j.companyName,
                status: j.status,
                location: j.location,
                candidateCount: j.candidates?.length || 0,
              }))
            : [];
        } else {
          data = await getJobById(tenantId, input.id!);
        }
        break;

      case 'pipeline':
        if (input.action === 'list') {
          data = await getAllPipeline(tenantId);
        } else {
          data = await getPipelineById(tenantId, input.id!);
        }
        break;
    }

    return {
      success: true,
      data,
      metadata: {
        source: 'internal',
        tenantId,
        dataType: input.data_type,
        action: input.action,
        filter: dataType === 'contacts' || dataType === 'leads' ? filter : undefined,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Internal data error:', errorMessage);
    return {
      success: false,
      error: errorMessage,
      metadata: { type: 'exception' },
    };
  }
}
