import { NextRequest } from 'next/server';
import { logApolloUsage } from '@/lib/aws/athena-bedrock';
import { searchJobs } from '@/lib/apollo/client';

const APOLLO_COST_PER_RESULT = 0.01;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const searchQuery = body.q || body.title || body.query || '';

    const result = await searchJobs({
      q: searchQuery,
      titles: body.titles || body.personTitles || (searchQuery ? [searchQuery] : []),
      locations: body.locations || (body.location ? [body.location] : []),
      keywords: body.keywords,
      per_page: body.per_page || 25,
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
