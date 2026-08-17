/**
 * GET   /api/agent/goal-runs/:id
 * PATCH /api/agent/goal-runs/:id  { visibility: 'public' | 'private' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canViewGoalRun,
  getGoalRun,
  setGoalRunVisibility,
} from '@/lib/db/repositories/agent-goal-run-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const run = await getGoalRun(session.tenantId, id);
  if (!run || !canViewGoalRun(run, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({
    run: {
      ...run,
      isOwner: run.userId === session.userId,
      persisted: true,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const v = String(body.visibility || body.sharing || '')
    .toLowerCase()
    .trim();
  if (v !== 'public' && v !== 'private') {
    return NextResponse.json(
      { error: 'visibility must be public or private' },
      { status: 400 }
    );
  }

  const updated = await setGoalRunVisibility(
    session.tenantId,
    session.userId,
    id,
    v
  );
  if (!updated) {
    return NextResponse.json(
      { error: 'Not found or only the owner can change sharing' },
      { status: 403 }
    );
  }

  return NextResponse.json({
    run: { ...updated, isOwner: true, persisted: true },
    message:
      v === 'public'
        ? 'Now public — teammates see it under AI → CRM goal → History'
        : 'Now private — only you can see this run',
  });
}
