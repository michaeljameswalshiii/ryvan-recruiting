/**
 * POST /api/agent/source-candidates
 * Source people to fill a job — from careers URL, job id, or role brief.
 *
 * Body: { input | query | brief | url, jobId?, limit? }
 * GET  — capability status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import { sourceCandidatesForJob } from '@/lib/sourcing/job-candidate-search';
import { resolveApolloConfigured } from '@/lib/apollo/client';
import { isPdlConfigured } from '@/lib/pdl/client';
import {
  agentCoreWebSearchStatus,
  isAgentCoreWebSearchConfigured,
} from '@/lib/agentcore/web-search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession().catch(() => null);
  const tenantId =
    request.headers.get('x-tenant-id') ||
    session?.tenantId ||
    (await getSessionTenantId().catch(() => null));

  const apollo = await resolveApolloConfigured(
    tenantId ? { tenantId } : undefined
  );
  const web = agentCoreWebSearchStatus();

  return NextResponse.json({
    // LLM path always available when Bedrock credentials work
    configured: true,
    engines: {
      apollo,
      pdl: isPdlConfigured(),
      agentcoreWeb: web.configured,
      llm: true,
    },
    message:
      'Paste a careers job URL or role brief. We extract the req and find people via Apollo/PDL or LLM + Nova web grounding (person-shaped results).',
    costNote:
      'LLM: tokens + $ · Apollo People Search: results + 0 credits (rate limits apply) · PDL/AgentCore when used',
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession().catch(() => null);
    const userId =
      request.headers.get('x-user-id') ||
      session?.userId ||
      (await getSessionUserId().catch(() => null));
    const tenantId =
      request.headers.get('x-tenant-id') ||
      session?.tenantId ||
      (await getSessionTenantId().catch(() => null));

    if (!userId || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const input = String(
      body.input ||
        body.query ||
        body.brief ||
        body.url ||
        body.jobUrl ||
        ''
    ).trim();
    const jobId = body.jobId ? String(body.jobId) : undefined;
    // location: omit = use job; "" or "any"/"worldwide" = no filter; else override
    let location: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'location')) {
      const loc = body.location;
      if (loc == null || loc === '' || loc === 'any' || loc === 'worldwide') {
        location = '';
      } else {
        location = String(loc).trim();
      }
    }

    if (!input && !jobId) {
      return NextResponse.json(
        {
          error:
            'Paste a careers job URL (…/careers/{tenant}/{jobId}), a job id, or a role description',
        },
        { status: 400 }
      );
    }

    const result = await sourceCandidatesForJob({
      input: input || jobId || '',
      jobId,
      tenantId,
      userId,
      limit: body.limit != null ? Number(body.limit) : 15,
      location,
    });

    if (!result.ok && !result.candidates.length) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          job: result.job,
          candidates: [],
          notes: result.notes,
          estimatedCostUsd: result.estimatedCostUsd,
          costs: result.costs,
          usageBreakdown: result.usageBreakdown,
          usageLine: result.usageLine,
        },
        { status: result.job ? 502 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      job: result.job,
      candidates: result.candidates,
      count: result.candidates.length,
      notes: result.notes,
      estimatedCostUsd: result.estimatedCostUsd,
      estimatedToolCostUsd: result.estimatedCostUsd,
      costs: result.costs,
      usageBreakdown: result.usageBreakdown,
      usageLine: result.usageLine,
      message:
        result.usageLine ||
        `Found ${result.candidates.length} candidate(s) for ${result.job?.title || 'this role'}. ~$${result.estimatedCostUsd.toFixed(4)} est.`,
    });
  } catch (err: any) {
    console.error('[agent/source-candidates]', err);
    return NextResponse.json(
      { error: err?.message || 'Sourcing failed' },
      { status: 500 }
    );
  }
}
