import { NextRequest } from 'next/server';
import { logApolloUsage } from '@/lib/aws/athena-bedrock';
import { searchJobs } from '@/lib/apollo/client';
import { getSession, getSessionTenantId } from '@/lib/server-auth';

const APOLLO_COST_PER_RESULT = 0.01;

async function resolveTenantId(request: NextRequest): Promise<string | null> {
  const session = await getSession().catch(() => null);
  return (
    request.headers.get('x-tenant-id') ||
    session?.tenantId ||
    (await getSessionTenantId().catch(() => null)) ||
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const tenantId = await resolveTenantId(request);
    const searchQuery = body.q || body.title || body.query || '';

    const result = await searchJobs({
      q: searchQuery,
      titles: body.titles || body.personTitles || (searchQuery ? [searchQuery] : []),
      locations: body.locations || (body.location ? [body.location] : []),
      keywords: body.keywords,
      per_page: body.per_page || 25,
      auth: tenantId ? { tenantId } : undefined,
    });

    if (result.error && result.jobs.length === 0) {
      return Response.json(
        {
          success: false,
          error: result.error,
          jobs: [],
          total: 0,
        },
        { status: result.error.includes('not configured') ? 400 : 502 }
      );
    }

    if (result.jobs.length > 0) {
      logApolloUsage({
        modelId: 'apollo-jobs-search',
        resultsCount: result.jobs.length,
        estimatedCost: result.jobs.length * APOLLO_COST_PER_RESULT,
        queryPreview: searchQuery,
        tenantId: tenantId || undefined,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      jobs: result.jobs,
      total: result.total,
      note:
        result.jobs.some((j) => j.source === 'apollo_hiring_company')
          ? 'Some results are companies actively hiring (job posting details unavailable for that org).'
          : undefined,
    });
  } catch (error: any) {
    console.error('Apollo Jobs Error:', error);
    return Response.json(
      {
        success: false,
        error: error?.message || 'Job search failed',
        jobs: [],
      },
      { status: 500 }
    );
  }
}
