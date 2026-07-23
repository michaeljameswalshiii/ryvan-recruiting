/**
 * Client-side batched import for list-builder → Trio.
 * @clientSafe
 */

import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';

export type ImportBatchProgress = {
  /** Rows finished across all batches (attempted) */
  done: number;
  total: number;
  companies: number;
  contacts: number;
  skipped: number;
  batchIndex: number;
  batchCount: number;
  message: string;
};

export type BatchedImportResult = {
  success: boolean;
  importedCompanies: number;
  importedContacts: number;
  skipped: number;
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

/**
 * Import selected rows in chunks of importBatchSize so each request
 * stays under the server time budget. Reports progress after every batch.
 */
export async function importListBuilderInBatches(opts: {
  jobId: string;
  rowIds: string[];
  batchSize?: number;
  onProgress?: (p: ImportBatchProgress) => void;
  signal?: AbortSignal;
}): Promise<BatchedImportResult> {
  const batchSize =
    opts.batchSize && opts.batchSize > 0
      ? Math.min(opts.batchSize, LIST_BUILDER_DEFAULTS.importBatchSize)
      : LIST_BUILDER_DEFAULTS.importBatchSize;

  const ids = Array.from(new Set(opts.rowIds.map(String).filter(Boolean)));
  if (ids.length === 0) {
    return {
      success: false,
      importedCompanies: 0,
      importedContacts: 0,
      skipped: 0,
      processed: 0,
      error: 'No rows selected',
    };
  }

  const batches = chunkIds(ids, batchSize);
  let companies = 0;
  let contacts = 0;
  let skipped = 0;
  let processed = 0;

  for (let i = 0; i < batches.length; i++) {
    if (opts.signal?.aborted) {
      return {
        success: false,
        importedCompanies: companies,
        importedContacts: contacts,
        skipped,
        processed,
        error: 'Import cancelled',
        partial: processed > 0,
      };
    }

    const batch = batches[i];
    opts.onProgress?.({
      done: processed,
      total: ids.length,
      companies,
      contacts,
      skipped,
      batchIndex: i + 1,
      batchCount: batches.length,
      message: `Importing ${processed + 1}–${Math.min(processed + batch.length, ids.length)} of ${ids.length}…`,
    });

    let res: Response;
    try {
      res = await fetch(`/api/list-builder/${opts.jobId}/import`, {
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
        importedCompanies: companies,
        importedContacts: contacts,
        skipped,
        processed,
        error: msg,
        partial: processed > 0,
      };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        importedCompanies: companies,
        importedContacts: contacts,
        skipped,
        processed,
        error: data.error || `Import batch failed (${res.status})`,
        partial: processed > 0,
      };
    }

    companies += Number(data.importedCompanies || 0);
    contacts += Number(data.importedContacts || 0);
    skipped += Number(data.skipped || 0);
    processed += Number(data.processed || batch.length);

    opts.onProgress?.({
      done: processed,
      total: ids.length,
      companies,
      contacts,
      skipped,
      batchIndex: i + 1,
      batchCount: batches.length,
      message: `Imported ${processed} of ${ids.length}…`,
    });
  }

  return {
    success: true,
    importedCompanies: companies,
    importedContacts: contacts,
    skipped,
    processed,
  };
}
