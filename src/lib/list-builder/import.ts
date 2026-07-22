/**
 * Import selected list-builder rows into Trio companies + contacts.
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
import { hasContactSignal, isKeepableContact } from './runner';

export async function importListBuilderRows(
  tenantId: string,
  jobId: string,
  rowIds: string[]
): Promise<{
  success: boolean;
  importedCompanies: number;
  importedContacts: number;
  skipped: number;
  error?: string;
  job?: any;
}> {
  const job = await getListBuilderJob(tenantId, jobId);
  if (!job) return { success: false, importedCompanies: 0, importedContacts: 0, skipped: 0, error: 'Job not found' };

  const idSet = new Set(rowIds);
  // Allow complete (email+phone) and partial (email or phone) rows
  const rows = (job.results || []).filter(
    (r) => idSet.has(r.id) && !r.imported && isKeepableContact(r)
  );
  if (rows.length === 0) {
    return {
      success: false,
      importedCompanies: 0,
      importedContacts: 0,
      skipped: 0,
      error: 'No selected rows with an email or phone to import',
    };
  }

  let importedCompanies = 0;
  let importedContacts = 0;
  let skipped = 0;
  const clients = await getAllClients(tenantId);
  const updatedResults = [...job.results];

  for (const row of rows) {
    const idx = updatedResults.findIndex((r) => r.id === row.id);
    try {
      let companyId = row.existingCompanyId;
      let company = companyId
        ? await getClientById(tenantId, companyId)
        : null;

      if (!company) {
        // Match again by name
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
        const created = await createClient(tenantId, {
          name: row.companyName,
          domain: row.website
            ? row.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
            : undefined,
          city: row.city || '',
          state: row.state || '',
          // Reuse existing Dynamo company fields where possible
          industry: row.industry || job.industry || '',
          employee_count: row.employeeCount || undefined,
          company_size: row.companySize || undefined,
          open_jobs_posted:
            row.openJobsPosted != null ? row.openJobsPosted : undefined,
          status: 'identification',
          notes: `Imported from BD list builder. Source: ${row.sourceUrl || row.website || 'web'}`,
        } as any);
        company = created;
        companyId = created?.id;
        importedCompanies++;
        if (created) clients.push(created);
      } else if (companyId) {
        // Fill firmographic gaps on existing company without overwriting user data
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
          const updated = await addContactToClient(tenantId, companyId, {
            name: row.contactName || row.email || 'Contact',
            title: row.contactTitle || '',
            email: row.email || '',
            phone: row.phone || '',
            isPrimary: contacts.length === 0,
            notes: row.notes || 'From BD list builder',
          });
          const createdContact = (updated?.contacts || []).find(
            (c: any) =>
              (em && (c.email || '').toLowerCase() === em) ||
              (row.contactName &&
                (c.name || '').toLowerCase() === row.contactName!.toLowerCase())
          );
          contactId = createdContact?.id;
          importedContacts++;
        }
      } else if (!hasContactSignal(row)) {
        // company only — ok
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

  const updatedJob = await updateListBuilderJob(tenantId, jobId, {
    results: updatedResults,
    status: 'completed',
    progress: {
      ...job.progress,
      lastMessage: `Imported ${importedCompanies} companies, ${importedContacts} contacts.`,
    },
  });

  return {
    success: true,
    importedCompanies,
    importedContacts,
    skipped,
    job: updatedJob,
  };
}
