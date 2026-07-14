import { NextRequest } from 'next/server';
import { logApolloUsage } from '@/lib/aws/athena-bedrock';
import { searchCompanies } from '@/lib/apollo/client';

const APOLLO_COST_PER_RESULT = 0.005;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const result = await searchCompanies({
      q: body.q || body.query || '',
      keywords: body.keywords,
      locations: body.locations || body.organization_locations,
      industries: body.industries || body.organization_industries,
      employeeRanges:
        body.employeeRanges || body.organization_num_employees_ranges,
      jobTitles: body.jobTitles || body.q_organization_job_titles,
      minJobs: body.minJobs,
      per_page: body.per_page || 25,
      page: body.page || 1,
    });

    if (result.error && result.companies.length === 0) {
      return Response.json(
        {
          success: false,
          error: result.error,
          companies: [],
          // Also alias organizations for any legacy clients
          organizations: [],
          total: 0,
        },
        { status: result.error.includes('not configured') ? 400 : 502 }
      );
    }

    if (result.companies.length > 0) {
      logApolloUsage({
        modelId: 'apollo-companies-search',
        resultsCount: result.companies.length,
        estimatedCost: result.companies.length * APOLLO_COST_PER_RESULT,
        queryPreview: body.q || body.query,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      companies: result.companies,
      // Apollo native name — both always present now
      organizations: result.companies,
      total: result.total,
    });
  } catch (error: any) {
    console.error('Apollo Companies Error:', error);
    return Response.json(
      {
        success: false,
        error: error?.message || 'Company search failed',
        companies: [],
        organizations: [],
      },
      { status: 500 }
    );
  }
}
