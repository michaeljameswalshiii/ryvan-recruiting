/**
 * Import selected list-builder rows into Trio companies + contacts.
 * Designed for small server batches; the UI loops over chunks.
 * @serverOnly
 */

import {
  getListBuilderJob,
  updateListBuilderJob,
} from '@/lib/db/repositories/list-builder-repository';
import {
  addContactToClient,
  createClient,
  getAllClients,
  getClientById,
  updateClient,
} from '@/lib/db/repositories/client-repository';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';
import { hasContactSignal, isKeepableContact } from './runner';

export type ImportListBuilderResult = {
  success: boolean;
  importedCompanies: number;
  importedContacts: number;
  skipped: number;
  /** Rows processed in this request */
  processed: number;
  /** Keepable rows still not imported after this batch */
  remainingUnimported: number;
  /** True when no keepable unimported rows left on the job */
  done: boolean;
  error?: string;
  job?: any;
};

/**
 * Import up to `maxRows` of the given rowIds (default: importBatchSize).
 * Prefer client-side chunking so large lists never sit in one 60s+ invocation.
 */
export async function importListBuilderRows(
  tenantId: string,
  jobId: string,
  rowIds: string[],
  options?: { maxRows?: number }
): Promise<ImportListBuilderResult> {
  const job = await getListBuilderJob(tenantId, jobId);
  if (!job) {
    return {
      success: false,
      importedCompanies: 0,
      importedContacts: 0,
      skipped: 0,
      processed: 0,
      remainingUnimported: 0,
      done: false,
      error: 'Job not found',
    };
  }

  const maxRows = Math.min(
    Math.max(1, options?.maxRows ?? LIST_BUILDER_DEFAULTS.importBatchSize),
    LIST_BUILDER_DEFAULTS.importBatchSize
  );

  const idSet = new Set(rowIds.map(String));
  const isImportable = (r: {
    email?: string;
    phone?: string;
    website?: string;
    companyName?: string;
    contactCompleteness?: string;
  }) =>
    isKeepableContact(r) ||
    r.contactCompleteness === 'website' ||
    (!!r.website && !!r.companyName);

  // Contact rows + website-only company leads
  const candidates = (job.results || []).filter(
    (r) => idSet.has(r.id) && !r.imported && isImportable(r)
  );
  const rows = candidates.slice(0, maxRows);

  if (rows.length === 0) {
    const remaining = (job.results || []).filter(
      (r) => !r.imported && isImportable(r)
    ).length;
    return {
      success: false,
      importedCompanies: 0,
      importedContacts: 0,
      skipped: 0,
      processed: 0,
      remainingUnimported: remaining,
      done: remaining === 0,
      error: 'No selected rows to import (need company website and/or contact)',
    };
  }

  let importedCompanies = 0;
  let importedContacts = 0;
  let skipped = 0;
  const clients = await getAllClients(tenantId);
  const updatedResults = [...(job.results || [])];

  for (const row of rows) {
    const idx = updatedResults.findIndex((r) => r.id === row.id);
    try {
      let companyId = row.existingCompanyId;
      let company = companyId
        ? await getClientById(tenantId, companyId)
        : null;

      if (!company) {
        const n = (row.companyName || '').toLowerCase();
        company =
          clients.find(
            (c: any) =>
              (c.name || '').toLowerCase() === n ||
              (c.name || '').toLowerCase().includes(n)
          ) || null;
        companyId = company?.id;
      }

      if (!company) {
        const created = await createClient(
          tenantId,
          {
            name: row.companyName,
            domain: row.website
              ? row.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
              : undefined,
            city: row.city || '',
            state: row.state || '',
            industry: row.industry || job.industry || '',
            employee_count: row.employeeCount || undefined,
            company_size: row.companySize || undefined,
            open_jobs_posted:
              row.openJobsPosted != null ? row.openJobsPosted : undefined,
            status: 'identification',
            notes: `Imported from BD list builder. Source: ${row.sourceUrl || row.website || 'web'}`,
          } as any,
          job.userId ? { userId: job.userId } : undefined,
        );
        company = created;
        companyId = created?.id;
        importedCompanies++;
        if (created) clients.push(created);
      } else if (companyId) {
        const patch: Record<string, unknown> = {};
        if (!company.industry && (row.industry || job.industry)) {
          patch.industry = row.industry || job.industry;
        }
        if (
          (company.employee_count == null || company.employee_count === '') &&
          row.employeeCount
        ) {
          patch.employee_count = row.employeeCount;
        }
        if (!company.company_size && row.companySize) {
          patch.company_size = row.companySize;
        }
        if (
          (company.open_jobs_posted == null ||
            company.open_jobs_posted === '') &&
          row.openJobsPosted != null
        ) {
          patch.open_jobs_posted = row.openJobsPosted;
        }
        if (Object.keys(patch).length > 0) {
          try {
            await updateClient(tenantId, companyId, patch as any);
          } catch (e) {
            console.warn('[list-builder import] firmographic patch failed', e);
          }
        }
      }

      let contactId: string | undefined;
      if (companyId && hasContactSignal(row)) {
        const contacts = Array.isArray(company?.contacts) ? company.contacts : [];
        const em = (row.email || '').toLowerCase();
        const exists = contacts.some(
          (c: any) =>
            (em && (c.email || '').toLowerCase() === em) ||
            (row.contactName &&
              (c.name || '').toLowerCase() === row.contactName.toLowerCase())
        );
        if (!exists) {
          const updated = await addContactToClient(
            tenantId,
            companyId,
            {
              name: row.contactName || row.email || 'Contact',
              title: row.contactTitle || '',
              email: row.email || '',
              phone: row.phone || '',
              isPrimary: contacts.length === 0,
              notes: row.notes || 'From BD list builder',
            },
            job.userId ? { userId: job.userId } : undefined,
          );
          const createdContact = (updated?.contacts || []).find(
            (c: any) =>
              (em && (c.email || '').toLowerCase() === em) ||
              (row.contactName &&
                (c.name || '').toLowerCase() === row.contactName!.toLowerCase())
          );
          contactId = createdContact?.id;
          importedContacts++;
        }
      }

      if (idx >= 0) {
        updatedResults[idx] = {
          ...updatedResults[idx],
          imported: true,
          importedCompanyId: companyId,
          importedContactId: contactId,
          existingCompanyId: companyId,
          companyExists: true,
          selected: false,
        };
      }
    } catch (err) {
      console.error('[list-builder import] row failed', row.companyName, err);
      skipped++;
    }
  }

  const remainingUnimported = updatedResults.filter(
    (r) => !r.imported && isKeepableContact(r)
  ).length;
  const done = remainingUnimported === 0;
  // Only mark completed when nothing keepable left to import (batched imports)
  const nextStatus = done ? 'completed' : 'awaiting_import';

  const batchNote =
    `Imported +${importedCompanies} companies, +${importedContacts} contacts` +
    (skipped ? `, ${skipped} skipped` : '') +
    ` this batch` +
    (done
      ? ' · list fully imported.'
      : ` · ${remainingUnimported} keepable left on list.`);

  const updatedJob = await updateListBuilderJob(tenantId, jobId, {
    results: updatedResults,
    status: nextStatus,
    progress: {
      ...job.progress,
      lastMessage: batchNote,
    },
  });

  return {
    success: true,
    importedCompanies,
    importedContacts,
    skipped,
    processed: rows.length,
    remainingUnimported,
    done,
    job: updatedJob,
  };
}
