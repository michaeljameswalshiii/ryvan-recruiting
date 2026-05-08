import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Apollo People Search
 * =========================
 * Search Apollo.io for candidate profiles with contact data.
 * 
 * Input (POST body):
 * {
 *   "query": "Python developer Miami",
 *   "page": 1,
 *   "per_page": 10
 * }
 * 
 * Output:
 * {
 *   "success": true,
 *   "results": [...],
 *   "count": number
 * }
 */

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.APOLHO_API_KEY || "9tMwBHqyM2mztDN1qfHXpQ";
const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

export async function POST(request: NextRequest) {
  try {
const body = await request.json();
    const { 
      query, 
      page = 1, 
      per_page = 10 
    } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    console.log("Searching Apollo for:", query, "location:", body.location);

// Search for people using Apollo API
    let response;
    try {
      response = await fetch(`${APOLLO_BASE_URL}/people/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": APOLLO_API_KEY,
        },
        body: JSON.stringify({
          q: query,
          page: page,
          per_page: per_page,
          // Only add location if provided
          ...(body.location && { location: body.location }),
          // Get contact info
          contact_email_verified: true,
          with_phone_only: false,
        }),
      });
    } catch (fetchErr: any) {
      console.error("Fetch error:", fetchErr.message);
      return NextResponse.json(
        { error: "Fetch failed", details: fetchErr.message },
        { status: 500 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Apollo API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Format results
    const results = data.people?.map((person: any) => ({
      id: person.id,
      name: person.name,
      title: person.title,
      organization: person.organization?.name,
      linkedin_url: person.linkedin_url,
      email: person.email,
      phone: person.phone_number,
      location: person.location,
      headline: person.headline,
      bio: person.bio,
    })) || [];

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
      total: data.total,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to search Apollo";
    console.error("Apollo search error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
