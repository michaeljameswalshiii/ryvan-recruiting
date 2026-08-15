import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { getRecruiterRun, setRecruiterRunStatus, setRecruiterRunVisibility, updateRecruiterRun } from '@/lib/db/repositories/recruiter-run-repository';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const run = await getRecruiterRun(session.tenantId, id);
  if (!run || (run.userId !== session.userId && run.visibility !== 'public')) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const run = await getRecruiterRun(session.tenantId, id);
  if (!run || run.userId !== session.userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const visibility = String(body.visibility || '').toLowerCase();
  if (visibility === 'private' || visibility === 'public') {
    const updated = await setRecruiterRunVisibility(session.tenantId, session.userId, run.id, visibility);
    if (!updated) return NextResponse.json({ error: 'Not found or only the owner can change sharing' }, { status: 403 });
    return NextResponse.json({ run: updated, message: visibility === 'public' ? 'Now public - teammates can see this run' : 'Now private - only you can see this run' });
  }
  const action = String(body.action || '').toLowerCase();
  if (action === 'feedback') {
    const candidateKey = String(body.candidateKey || '').trim().slice(0, 500);
    const decision = String(body.decision || '').toLowerCase();
    const allowed = ['strong_fit', 'not_fit', 'wrong_location', 'wrong_seniority', 'contacted', 'saved'];
    if (!candidateKey || !allowed.includes(decision)) {
      return NextResponse.json({ error: 'Candidate and a valid feedback decision are required.' }, { status: 400 });
    }
    const updated = await updateRecruiterRun(session.tenantId, run.id, {
      feedback: {
        ...(run.feedback || {}),
        [candidateKey]: {
          decision: decision as any,
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
          updatedAt: new Date().toISOString(),
          userId: session.userId,
        },
      },
    });
    return NextResponse.json({ run: updated, message: 'Recruiter feedback saved.' });
  }
  if (!['pause', 'resume', 'cancel'].includes(action)) return NextResponse.json({ error: 'Action must be pause, resume, or cancel' }, { status: 400 });
  const status = action === 'pause' ? 'paused' : action === 'cancel' ? 'cancelled' : 'queued';
  return NextResponse.json({ run: await setRecruiterRunStatus(session.tenantId, run.id, status) });
}
