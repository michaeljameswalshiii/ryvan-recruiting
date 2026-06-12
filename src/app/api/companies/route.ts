import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Apollo Company Search
 * ============================
 * Server-side proxy for Apollo.io company search.
 * Uses APOLLO_API_KEY from server environment (secure).
 * 
 * Input (POST body):
 * {
 *   "query": "construction",      // required
 *   "location": "Boca Raton, FL",
 *   "employeeCount": "1-500",
 *   "page": 1,
 *   "per_page": 20
 * }
 * 
 * Output:
 * {
 *   "success": true,
 *   "results": [...],
 *   "count": number
 * }
 */

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

/**
 * Get Apollo API key
 * Throws error if not configured
 */
function getApolloApiKey(): string {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY environment variable not configured");
  }
  return APOLLO_API_KEY;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      location,
      employeeCount,
      page = 1,
      per_page = 20,
    } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    console.log("[COMPANIES] Searching for:", query, "location:", location);

    // Build request to Apollo Companies API
    const apiKey = getApolloApiKey();
    
    // Map employee count to Apollo format
    const employeeRanges: string[] = [];
    if (employeeCount) {
      employeeRanges.push(employeeCount);
    }

    const response = await fetch(`${APOLLO_BASE_URL}/companies/search`, {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      }),
      body: JSON.stringify({
        q: query,
        page: page,
        per_page: per_page,
        ...(location && { locations: [location] }),
        ...(employeeRanges.length > 0 && { employee_ranges: employeeRanges }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[COMPANIES] Apollo error:", response.status, errorText);
      throw new Error(`Apollo API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Format results
    const results = data.companies?.map((company: any) => ({
      id: company.id,
      name: company.name,
      domain: company.domain,
      linkedin_url: company.linkedin_url,
      city: company.city,
      state: company.region,
      country: company.country,
      employee_count: company.employee_count,
      industry: company.industry,
      description: company.company_type,
    })) || [];

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
      total: data.total,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Company search failed";
    console.error("[COMPANIES] Error:", message);
    
    return NextResponse.json(
      { error: message, results: [] },
      { status: 500 }
    );
  }
}
