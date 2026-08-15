import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  getRecruiterAgentConfig,
  getRecruiterAgentUsage,
  updateRecruiterAgentConfig,
} from '@/lib/db/repositories/recruiter-agent-repository';
import { updateRecruiterAgentConfigSchema } from '@/lib/schemas/recruiter-agent';

export const dynamic = 'force-dynamic';

async function context() {
  const session = await getSession().catch(() => null);
  if (!session?.tenantId || !session.userId) return null;
  return session;
}

export async function GET() {
  const session = await context();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [config, usage] = await Promise.all([
    getRecruiterAgentConfig(session.tenantId),
    getRecruiterAgentUsage(session.tenantId),
  ]);
  return NextResponse.json({
    config,
    usage,
    remaining: {
      dailyUsd: Math.max(0, config.dailyBudgetUsd - usage.dayUsd),
      monthlyUsd: Math.max(0, config.monthlyBudgetUsd - usage.monthUsd),
      dailyRuns: Math.max(0, config.maxRunsPerDay - usage.dayRuns),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await context();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = updateRecruiterAgentConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid recruiter agent settings', details: parsed.error.flatten() }, { status: 400 });
  }
  const config = await updateRecruiterAgentConfig(
    session.tenantId,
    parsed.data,
    session.userId
  );
  const usage = await getRecruiterAgentUsage(session.tenantId);
  return NextResponse.json({ config, usage });
}
