import { NextRequest } from 'next/server';
import { logApolloUsage } from '@/lib/aws/athena-bedrock';
import { searchCompanies } from '@/lib/apollo/client';

const APOLLO_COST_PER_RESULT = 0.01;

/**
 * Legacy company search endpoint used by some tools.
 * Always returns normalized { companies, organizations }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawQuery = (body.q || body.query || '').trim();

    const result = await searchCompanies({
      q: rawQuery,
      keywords: body.keywords || (rawQuery ? [rawQuery] : []),
      locations: body.locations || (body.location ? [body.location] : []),
      industries: body.industries || (body.industry ? [body.industry] : []),
      employeeRanges: body.organization_num_employees_ranges,
      per_page: body.per_page || 20,
      page: body.page || 1,
    });

    if (result.error && result.companies.length === 0) {
      return Response.json(
        { success: false, error: result.error, companies: [], organizations: [] },
        { status: 502 }
      );
    }

    if (result.companies.length > 0) {
      logApolloUsage({
        modelId: 'apollo-company-search',
        resultsCount: result.companies.length,
        estimatedCost: result.companies.length * APOLLO_COST_PER_RESULT,
        queryPreview: rawQuery,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      companies: result.companies,
      organizations: result.companies,
      total: result.total,
    });
  } catch (error: any) {
    console.error('Apollo search route error:', error);
    return Response.json(
      {
        success: false,
        error: error?.message || 'Search failed',
        companies: [],
        organizations: [],
      },
      { status: 500 }
    );
  }
}
