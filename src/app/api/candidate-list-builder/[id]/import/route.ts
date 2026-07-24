/**
 * POST /api/candidate-list-builder/:id/import
 * Body: { rowIds: string[], confirmed: true, maxRows?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canViewCandidateListBuilderJob,
  getCandidateListBuilderJob,
} from '@/lib/db/repositories/candidate-list-builder-repository';
import { importCandidateListBuilderRows } from '@/lib/candidate-list-builder/import';
import { CANDIDATE_LIST_BUILDER_DEFAULTS } from '@/lib/schemas/candidate-list-builder';

export const dynamic = 'force-dynamic';
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
  const job = await getCandidateListBuilderJob(session.tenantId, id);
  if (!job || !canViewCandidateListBuilderJob(job, session.userId)) {
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
        message: 'Send confirmed:true after reviewing the selection.',
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
      : CANDIDATE_LIST_BUILDER_DEFAULTS.importBatchSize;
  const maxRows = Math.min(
    Math.max(1, Math.floor(requestedMax)),
    CANDIDATE_LIST_BUILDER_DEFAULTS.importBatchSize
  );

  const result = await importCandidateListBuilderRows(
    session.tenantId,
    id,
    rowIds,
    { maxRows }
  );

  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error,
        importedLeads: result.importedLeads,
        skipped: result.skipped,
        duplicates: result.duplicates,
        processed: result.processed,
        remainingUnimported: result.remainingUnimported,
        done: result.done,
      },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
