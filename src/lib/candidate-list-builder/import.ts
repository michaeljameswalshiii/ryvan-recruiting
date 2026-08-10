/**
 * Import selected candidate-list-builder rows into Trio leads (candidates).
 * @serverOnly
 */

import {
  getCandidateListBuilderJob,
  updateCandidateListBuilderJob,
} from '@/lib/db/repositories/candidate-list-builder-repository';
import {
  createLead,
  getLeadByEmail,
  getLeadByLinkedIn,
} from '@/lib/db/repositories/lead-repository';
import { CANDIDATE_LIST_BUILDER_DEFAULTS } from '@/lib/schemas/candidate-list-builder';
import { isKeepableCandidate } from './runner';
import type { CandidateListBuilderResultRow } from '@/lib/schemas/candidate-list-builder';

export type ImportCandidateListBuilderResult = {
  success: boolean;
  importedLeads: number;
  skipped: number;
  duplicates: number;
  processed: number;
  remainingUnimported: number;
  done: boolean;
  error?: string;
  job?: unknown;
};

export async function importCandidateListBuilderRows(
  tenantId: string,
  jobId: string,
  rowIds: string[],
  options?: { maxRows?: number }
): Promise<ImportCandidateListBuilderResult> {
  const job = await getCandidateListBuilderJob(tenantId, jobId);
  if (!job) {
    return {
      success: false,
      importedLeads: 0,
      skipped: 0,
      duplicates: 0,
      processed: 0,
      remainingUnimported: 0,
      done: false,
      error: 'Job not found',
    };
  }

  const maxRows = Math.min(
    Math.max(
      1,
      options?.maxRows ?? CANDIDATE_LIST_BUILDER_DEFAULTS.importBatchSize
    ),
    CANDIDATE_LIST_BUILDER_DEFAULTS.importBatchSize
  );

  const idSet = new Set(rowIds.map(String));
  const candidates = (job.results || []).filter(
    (r) => idSet.has(r.id) && !r.imported && isKeepableCandidate(r)
  );
  const rows = candidates.slice(0, maxRows);

  if (rows.length === 0) {
    const remaining = (job.results || []).filter(
      (r) => !r.imported && isKeepableCandidate(r)
    ).length;
    return {
      success: false,
      importedLeads: 0,
      skipped: 0,
      duplicates: 0,
      processed: 0,
      remainingUnimported: remaining,
      done: remaining === 0,
      error: 'No selected candidates to import',
    };
  }

  let importedLeads = 0;
  let skipped = 0;
  let duplicates = 0;
  const resultMap = new Map(
    (job.results || []).map((r) => [r.id, { ...r } as CandidateListBuilderResultRow])
  );

  for (const row of rows) {
    try {
      // Live duplicate check
      if (row.email) {
        const byEmail = await getLeadByEmail(tenantId, row.email);
        if (byEmail?.id) {
          const cur = resultMap.get(row.id);
          if (cur) {
            cur.imported = true;
            cur.importedLeadId = byEmail.id;
            cur.existingLeadId = byEmail.id;
            cur.leadExists = true;
            cur.selected = false;
          }
          duplicates++;
          continue;
        }
      }
      if (row.linkedinUrl) {
        const byLi = await getLeadByLinkedIn(tenantId, row.linkedinUrl);
        if (byLi?.id) {
          const cur = resultMap.get(row.id);
          if (cur) {
            cur.imported = true;
            cur.importedLeadId = byLi.id;
            cur.existingLeadId = byLi.id;
            cur.leadExists = true;
            cur.selected = false;
          }
          duplicates++;
          continue;
        }
      }

      const notesParts = [
        `Sourced via People Data Labs candidate agent`,
        job.brief ? `Brief: ${job.brief.slice(0, 200)}` : null,
        row.industry ? `Industry: ${row.industry}` : null,
        row.skills?.length ? `Skills: ${row.skills.slice(0, 12).join(', ')}` : null,
        row.pdlId ? `PDL id: ${row.pdlId}` : null,
      ].filter(Boolean);

      const lead = await createLead(
        tenantId,
        {
          name: row.name,
          email: row.email || '',
          phone: row.phone || '',
          location:
            row.location ||
            [row.city, row.state].filter(Boolean).join(', ') ||
            '',
          title: row.title || '',
          company: row.company || '',
          status: 'identification',
          source: 'pdl_candidate_agent',
          notes: notesParts.join('\n'),
          linkedin_url: row.linkedinUrl || '',
          skills: row.skills || [],
        } as any,
        job.userId ? { userId: job.userId } : undefined,
      );

      const cur = resultMap.get(row.id);
      if (cur) {
        cur.imported = true;
        cur.importedLeadId = lead.id;
        cur.selected = false;
      }
      importedLeads++;
    } catch (err) {
      console.error('[candidate-list-builder import]', row.id, err);
      skipped++;
    }
  }

  const nextResults = (job.results || []).map(
    (r) => resultMap.get(r.id) || r
  );
  const updated = await updateCandidateListBuilderJob(tenantId, jobId, {
    results: nextResults,
    status:
      nextResults.some((r) => !r.imported && isKeepableCandidate(r))
        ? job.status === 'completed'
          ? 'completed'
          : 'awaiting_import'
        : 'completed',
    progress: {
      ...job.progress,
      lastMessage: `Imported ${importedLeads} candidates${
        duplicates ? ` · ${duplicates} already in Trio` : ''
      }`,
    },
  });

  const remainingUnimported = nextResults.filter(
    (r) => !r.imported && isKeepableCandidate(r)
  ).length;

  return {
    success: true,
    importedLeads,
    skipped,
    duplicates,
    processed: rows.length,
    remainingUnimported,
    done: remainingUnimported === 0,
    job: updated,
  };
}
