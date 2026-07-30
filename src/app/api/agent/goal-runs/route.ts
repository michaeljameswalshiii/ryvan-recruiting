/**
 * GET  /api/agent/goal-runs — own + public goal-agent runs
 * POST /api/agent/goal-runs — upsert a goal run (progress + sharing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  listGoalRunsForUser,
  upsertGoalRun,
} from '@/lib/db/repositories/agent-goal-run-repository';
import type { AgentRunSnapshot } from '@/lib/ai/agent-run-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const runs = await listGoalRunsForUser(session.tenantId, session.userId);
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const run = (body.run || body) as AgentRunSnapshot;
  if (!run?.id || !run?.goal) {
    return NextResponse.json(
      { error: 'run.id and run.goal are required' },
      { status: 400 }
    );
  }

  const visibilityRaw = String(
    body.visibility || run.visibility || 'private'
  )
    .toLowerCase()
    .trim();
  const ownerLabel =
    (session as { email?: string }).email ||
    (session as { fullName?: string }).fullName ||
    session.userId;

  try {
    const saved = await upsertGoalRun(
      session.tenantId,
      session.userId,
      {
        ...run,
        visibility: visibilityRaw === 'public' ? 'public' : 'private',
      },
      String(ownerLabel)
    );
    return NextResponse.json({
      run: saved,
      message:
        saved.visibility === 'public'
          ? 'Saved and shared with your team'
          : 'Saved privately',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save goal run';
    console.error('[goal-runs POST]', err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
