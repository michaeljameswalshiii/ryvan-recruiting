import { NextRequest } from 'next/server';
import { logApolloUsage } from '@/lib/aws/athena-bedrock';
import { searchPeople } from '@/lib/apollo/client';

const APOLLO_COST_PER_RESULT = 0.01;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const result = await searchPeople({
      q: body.q || body.query || '',
      titles: body.titles || body.person_titles || body.personTitles,
      keywords: body.keywords,
      locations: body.locations || body.person_locations,
      personLocations: body.personLocations || body.person_locations,
      organizationLocations:
        body.organizationLocations || body.organization_locations,
      industries: body.industries,
      seniorities: body.seniorities,
      technologies: body.technologies,
      per_page: body.per_page || 25,
      page: body.page || 1,
    });

    if (result.error && result.people.length === 0) {
      return Response.json(
        {
          success: false,
          error: result.error,
          people: [],
          total: 0,
        },
        { status: result.error.includes('not configured') ? 400 : 502 }
      );
    }

    if (result.people.length > 0) {
      logApolloUsage({
        modelId: 'apollo-people-api-search',
        resultsCount: result.people.length,
        estimatedCost: result.people.length * APOLLO_COST_PER_RESULT,
        queryPreview: body.q || body.query,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      people: result.people,
      total: result.total,
      // keep raw for debug panel
      _debug: process.env.NODE_ENV === 'development' ? result.raw : undefined,
    });
  } catch (error: any) {
    console.error('Apollo People Error:', error);
    return Response.json(
      {
        success: false,
        error: error?.message || 'People search failed',
        people: [],
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    endpoint: 'people',
    message: 'POST with { q, titles, locations, keywords, seniorities }',
  });
}
