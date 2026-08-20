/**
 * POST /api/list-builder/:id/import
 * Body: { rowIds: string[], confirmed: true, maxRows?: number }
 *
 * Processes a small batch only — clients should loop for large selections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canViewListBuilderJob,
  getListBuilderJob,
} from '@/lib/db/repositories/list-builder-repository';
import { importListBuilderRows } from '@/lib/list-builder/import';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';

export const dynamic = 'force-dynamic';
/** Room for ~12 company+contact writes without hitting the old 60s cliff */
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const job = await getListBuilderJob(session.tenantId, id);
  // Public lists: any same-tenant teammate may import selected rows into their CRM
  if (!job || !canViewListBuilderJob(job, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.confirmed !== true && body.confirmed !== 'true') {
    return NextResponse.json(
      {
        error: 'Confirmation required',
        message: 'Send confirmed:true after reviewing the preview selection.',
      },
      { status: 400 }
    );
  }

  const rowIds: string[] = Array.isArray(body.rowIds)
    ? body.rowIds.map(String)
    : (job.results || []).filter((r) => r.selected !== false).map((r) => r.id);

  const requestedMax =
    body.maxRows != null && Number.isFinite(Number(body.maxRows))
      ? Number(body.maxRows)
      : LIST_BUILDER_DEFAULTS.importBatchSize;
  const maxRows = Math.min(
    Math.max(1, Math.floor(requestedMax)),
    LIST_BUILDER_DEFAULTS.importBatchSize
  );

  const result = await importListBuilderRows(session.tenantId, id, rowIds, {
    maxRows,
    actorUserId: session.userId,
  });
  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error,
        importedCompanies: result.importedCompanies,
        importedContacts: result.importedContacts,
        skipped: result.skipped,
        processed: result.processed,
        remainingUnimported: result.remainingUnimported,
        done: result.done,
      },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
