/**
 * Client-side batched import for candidate list-builder → Trio leads.
 * @clientSafe
 */

import { CANDIDATE_LIST_BUILDER_DEFAULTS } from '@/lib/schemas/candidate-list-builder';

export type CandidateImportBatchProgress = {
  done: number;
  total: number;
  leads: number;
  skipped: number;
  duplicates: number;
  batchIndex: number;
  batchCount: number;
  message: string;
};

export type BatchedCandidateImportResult = {
  success: boolean;
  importedLeads: number;
  skipped: number;
  duplicates: number;
  processed: number;
  error?: string;
  partial?: boolean;
};

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

export async function importCandidateListBuilderInBatches(opts: {
  jobId: string;
  rowIds: string[];
  batchSize?: number;
  onProgress?: (p: CandidateImportBatchProgress) => void;
  signal?: AbortSignal;
}): Promise<BatchedCandidateImportResult> {
  const batchSize =
    opts.batchSize && opts.batchSize > 0
      ? Math.min(opts.batchSize, CANDIDATE_LIST_BUILDER_DEFAULTS.importBatchSize)
      : CANDIDATE_LIST_BUILDER_DEFAULTS.importBatchSize;

  const ids = Array.from(new Set(opts.rowIds.map(String).filter(Boolean)));
  if (ids.length === 0) {
    return {
      success: false,
      importedLeads: 0,
      skipped: 0,
      duplicates: 0,
      processed: 0,
      error: 'No candidates selected',
    };
  }

  const batches = chunkIds(ids, batchSize);
  let leads = 0;
  let skipped = 0;
  let duplicates = 0;
  let processed = 0;

  for (let i = 0; i < batches.length; i++) {
    if (opts.signal?.aborted) {
      return {
        success: false,
        importedLeads: leads,
        skipped,
        duplicates,
        processed,
        error: 'Import cancelled',
        partial: processed > 0,
      };
    }

    const batch = batches[i];
    opts.onProgress?.({
      done: processed,
      total: ids.length,
      leads,
      skipped,
      duplicates,
      batchIndex: i + 1,
      batchCount: batches.length,
      message: `Importing ${processed + 1}–${Math.min(processed + batch.length, ids.length)} of ${ids.length}…`,
    });

    let res: Response;
    try {
      res = await fetch(`/api/candidate-list-builder/${opts.jobId}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIds: batch,
          confirmed: true,
          maxRows: batchSize,
        }),
        signal: opts.signal,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Network error during import';
      return {
        success: false,
        importedLeads: leads,
        skipped,
        duplicates,
        processed,
        error: msg,
        partial: processed > 0,
      };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        importedLeads: leads,
        skipped,
        duplicates,
        processed,
        error: data.error || `Import batch failed (${res.status})`,
        partial: processed > 0,
      };
    }

    leads += Number(data.importedLeads || 0);
    skipped += Number(data.skipped || 0);
    duplicates += Number(data.duplicates || 0);
    processed += Number(data.processed || batch.length);

    opts.onProgress?.({
      done: processed,
      total: ids.length,
      leads,
      skipped,
      duplicates,
      batchIndex: i + 1,
      batchCount: batches.length,
      message: `Imported ${processed} of ${ids.length}…`,
    });
  }

  return {
    success: true,
    importedLeads: leads,
    skipped,
    duplicates,
    processed,
  };
}
