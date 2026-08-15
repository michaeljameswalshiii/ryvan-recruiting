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
import {
  resolveApolloConfigured,
  resolveApiKeyDetailed,
  searchPeople as apolloSearchPeople,
} from '@/lib/apollo/client';
import { isPdlConfigured } from '@/lib/pdl/client';
import {
  agentCoreWebSearchStatus,
} from '@/lib/agentcore/web-search';
import { getTenantApolloPublic } from '@/lib/db/repositories/tenant-apollo-credentials-repository';
import {
  getRecruiterAgentConfig,
  getRecruiterAgentUsage,
} from '@/lib/db/repositories/recruiter-agent-repository';

export const dynamic = 'force-dynamic';

function importReady(candidate: { name?: string; title?: string; company?: string; linkedinUrl?: string; email?: string; phone?: string }) {
  const name = String(candidate.name || '').trim();
  const title = String(candidate.title || '').trim();
  const company = String(candidate.company || '').trim();
  const phone = String(candidate.phone || '').replace(/\D/g, '');
  const hasIdentity =
    /linkedin\.com\/in\/[a-z0-9-]+/i.test(String(candidate.linkedinUrl || '')) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(candidate.email || '')) ||
    phone.length >= 7;
  return name.length >= 5 && name.split(/\s+/).length >= 2 && !name.includes('*') &&
    title.length >= 3 && company.length >= 2 && hasIdentity;
}

export async function GET(request: NextRequest) {
  const session = await getSession().catch(() => null);
  const tenantId =
    request.headers.get('x-tenant-id') ||
    session?.tenantId ||
    (await getSessionTenantId().catch(() => null));

  const auth = tenantId ? { tenantId } : undefined;
  const apollo = await resolveApolloConfigured(auth);
  const keyInfo = await resolveApiKeyDetailed(auth);
  const tenantApollo = tenantId
    ? await getTenantApolloPublic(tenantId)
    : null;
  const web = agentCoreWebSearchStatus();

  // Live probe (1 person) so UI can show 401 vs healthy — search is 0 credits
  let apolloProbe: {
    ok: boolean;
    status?: number;
    people?: number;
    error?: string;
    keySource?: string;
  } = { ok: false };
  if (keyInfo.apiKey.length > 10) {
    const probe = await apolloSearchPeople({
      titles: ['software engineer'],
      locations: [],
      per_page: 1,
      page: 1,
      auth,
    });
    apolloProbe = {
      ok: !probe.error && (probe.people?.length || 0) >= 0 && !probe.error,
      status: probe.httpStatus,
      people: probe.people?.length || 0,
      error: probe.error,
      keySource: probe.keySource,
    };
    // ok if no error (even 0 people would be weird for software engineer)
    apolloProbe.ok = !probe.error;
  } else {
    apolloProbe = {
      ok: false,
      error: 'No Apollo key resolved',
      keySource: 'none',
    };
  }

  return NextResponse.json({
    configured: true,
    engines: {
      apollo: apollo && apolloProbe.ok,
      apolloKeyPresent: apollo,
      pdl: isPdlConfigured(),
      agentcoreWeb: web.configured,
      llm: true,
    },
    apollo: {
      keySource: keyInfo.source,
      tenantId: tenantId || null,
      tenantHasKey: tenantApollo?.hasKey || false,
      tenantKeyHint: tenantApollo?.keyHint,
      lastValidatedOk: tenantApollo?.lastValidatedOk,
      probe: apolloProbe,
    },
    message:
      'Paste a careers job URL or role brief. LLM reviews the JD → structured Apollo filters, then Apollo returns real people. Requires a master API key with People Search.',
    costNote:
      'LLM plan: tokens + $ · Apollo People Search: results + 0 credits (rate limits apply) · PDL/AgentCore when used',
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
    const agentConfig = await getRecruiterAgentConfig(tenantId);
    const agentUsage = await getRecruiterAgentUsage(tenantId);

    if (!agentConfig.enabled || agentConfig.paused) {
      return NextResponse.json(
        { error: 'Recruiter sourcing agent is paused. Resume it in Agent Controls before starting a run.' },
        { status: 409 }
      );
    }
    if (agentUsage.dayRuns >= agentConfig.maxRunsPerDay) {
      return NextResponse.json(
        { error: `Daily recruiter-agent run limit reached (${agentConfig.maxRunsPerDay}).` },
        { status: 429 }
      );
    }
    if (
      agentUsage.dayUsd >= agentConfig.dailyBudgetUsd ||
      agentUsage.monthUsd >= agentConfig.monthlyBudgetUsd
    ) {
      return NextResponse.json(
        { error: 'Recruiter-agent budget reached. Increase the budget or wait for the next period.' },
        { status: 429 }
      );
    }
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

    // Optional user-edited Apollo plan (skip LLM replan on retry)
    let apolloPlanOverride: Record<string, unknown> | null = null;
    if (body.apolloPlan && typeof body.apolloPlan === 'object') {
      apolloPlanOverride = body.apolloPlan as Record<string, unknown>;
    } else if (body.plan && typeof body.plan === 'object') {
      apolloPlanOverride = body.plan as Record<string, unknown>;
    }

    const requestedTarget = Number(body.targetQualified);
    const targetQualified = Number.isFinite(requestedTarget) && requestedTarget > 0
      ? Math.min(Math.floor(requestedTarget), 100)
      : Math.min(agentConfig.maxCandidatesPerRun, 100);
    const collectionLimit = Math.min(targetQualified * 2, 120);
    const batchRequested = body.batch === true;
    const batchSize = batchRequested
      ? Math.min(Math.max(Number(body.batchSize) || 25, 10), 50)
      : collectionLimit;
    const pageOffset = Math.max(0, Math.floor(Number(body.pageOffset) || 0));

    const result = await sourceCandidatesForJob({
      input: input || jobId || '',
      jobId,
      tenantId,
      userId,
      // Collect a larger pool because fit scoring happens after discovery.
      // The response is narrowed to qualified candidates below.
      limit: batchSize,
      pageOffset,
      location,
      locationRadius: body.locationRadius,
      apolloPlanOverride,
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
          apolloPlan: result.apolloPlan,
          apolloPlanSource: result.apolloPlanSource,
          apolloKeySource: result.apolloKeySource,
          apolloHttpStatus: result.apolloHttpStatus,
          apolloRequest: result.apolloRequest,
        },
        {
          status:
            result.apolloHttpStatus === 401 || result.apolloHttpStatus === 403
              ? 502
              : result.job
                ? 502
                : 400,
        }
      );
    }

    const allCandidates = result.candidates;
    const qualifiedCandidates = allCandidates.filter(
      (candidate) => (candidate.fitScore ?? 0) >= agentConfig.minFitScore
    );
    const reviewCandidates = allCandidates.filter(
      (candidate) =>
        (candidate.fitScore ?? 0) >= agentConfig.reviewFitScore &&
        (candidate.fitScore ?? 0) < agentConfig.minFitScore
    );
    const selectedCandidates = qualifiedCandidates.length >= targetQualified
      ? qualifiedCandidates.slice(0, targetQualified)
      : allCandidates;
    const importableCandidates = selectedCandidates
      .filter((candidate) => (candidate.fitScore ?? 0) >= agentConfig.minFitScore)
      .filter(importReady);

    return NextResponse.json({
      success: true,
      job: result.job,
      candidates: selectedCandidates,
      qualifiedCandidates,
      reviewCandidates,
      importableCandidates,
      rejectedCount: result.candidates.length - qualifiedCandidates.length - reviewCandidates.length,
      agentControls: {
        minFitScore: agentConfig.minFitScore,
        reviewFitScore: agentConfig.reviewFitScore,
        maxCandidatesPerRun: agentConfig.maxCandidatesPerRun,
        targetQualified,
      },
      targetQualified,
      targetReached: qualifiedCandidates.length >= targetQualified,
      batch: batchRequested,
      pageOffset,
      count: selectedCandidates.length,
      notes: result.notes,
      estimatedCostUsd: result.estimatedCostUsd,
      estimatedToolCostUsd: result.estimatedCostUsd,
      costs: result.costs,
      usageBreakdown: result.usageBreakdown,
      usageLine: result.usageLine,
      apolloPlan: result.apolloPlan,
      apolloPlanSource: result.apolloPlanSource,
      apolloKeySource: result.apolloKeySource,
      apolloHttpStatus: result.apolloHttpStatus,
      apolloRequest: result.apolloRequest,
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
