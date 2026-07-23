/**
 * POST /api/list-builder/:id/import
 * Body: { rowIds: string[], confirmed: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canViewListBuilderJob,
  getListBuilderJob,
} from '@/lib/db/repositories/list-builder-repository';
import { importListBuilderRows } from '@/lib/list-builder/import';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const result = await importListBuilderRows(session.tenantId, id, rowIds);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
