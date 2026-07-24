/**
 * POST /api/agentcore/web-search
 *   { query, maxResults?, purpose?: 'general'|'resume_research' }
 * GET  /api/agentcore/web-search — status + cost
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import {
  agentCoreWebSearchStatus,
  agentCoreWebSearchCostPerQuery,
} from '@/lib/agentcore/web-search';
import { executeAgentCoreWebSearch } from '@/lib/ai/tools/agentcore-web-search';
import type { ToolContext } from '@/lib/ai/tools/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const st = agentCoreWebSearchStatus();
  return NextResponse.json({
    ...st,
    costPerQueryUsd: agentCoreWebSearchCostPerQuery(),
    pricingNote:
      'AgentCore Web Search is ~$7 per 1,000 queries ($0.007 each). Multi-query resume research may run 2–3 searches.',
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
    const query = String(body.query || body.q || body.brief || '').trim();
    if (!query) {
      return NextResponse.json(
        { error: 'query is required (person name, role, company, resume keywords…)' },
        { status: 400 }
      );
    }

    const toolContext: ToolContext = {
      tenantId,
      userId,
      toolSpend: [],
    };

    const result = await executeAgentCoreWebSearch(
      {
        query,
        max_results: body.maxResults ?? body.max_results ?? 10,
        purpose: body.purpose || body.mode || 'resume_research',
        multi: body.multi,
        person: body.person,
        company: body.company,
        title: body.title,
      },
      toolContext
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          ...((result.data as object) || {}),
          toolSpend: toolContext.toolSpend,
          estimatedToolCostUsd: (toolContext.toolSpend || []).reduce(
            (s, e) => s + (e.estimatedCostUsd || 0),
            0
          ),
        },
        { status: result.error?.includes('not configured') ? 503 : 502 }
      );
    }

    const data = result.data as {
      results?: unknown[];
      count?: number;
      estimatedCostUsd?: number;
      queriesRun?: number;
      costPerQueryUsd?: number;
      note?: string;
      query?: string;
      latencyMs?: number;
    };

    return NextResponse.json({
      success: true,
      ...data,
      toolSpend: toolContext.toolSpend,
      estimatedToolCostUsd: data.estimatedCostUsd ?? 0,
      message:
        data.note ||
        'Cite titles and URLs when sharing results. Public web only — not a people database.',
    });
  } catch (err: any) {
    console.error('[agentcore/web-search]', err);
    return NextResponse.json(
      { error: err?.message || 'Web search failed' },
      { status: 500 }
    );
  }
}
