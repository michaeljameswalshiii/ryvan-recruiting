import { NextRequest } from "next/server";
import { logApolloUsage } from "@/lib/aws/athena-bedrock";

// Apollo pricing per result
const APOLLO_COST_PER_RESULT = 0.005;

export async function POST(request: NextRequest) {
  try {
    const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

    if (!APOLLO_API_KEY) {
      return Response.json({ error: "API key required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { q, locations, per_page } = body;

    const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q,
        locations: locations || [],
        per_page: per_page || 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo Companies Error:", response.status, errorText);
      return Response.json({ error: `Apollo API error ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    
    // Log Apollo usage after successful search
    const resultsCount = data.companies?.length || 0;
    if (resultsCount > 0) {
      logApolloUsage({
        modelId: 'apollo-companies-search',
        resultsCount,
        estimatedCost: resultsCount * APOLLO_COST_PER_RESULT,
        queryPreview: q,
      }).catch(() => {});
    }
    
    return Response.json(data);

  } catch (error: any) {
    console.error("Apollo Companies Proxy Error:", error);
    return Response.json({ 
      error: "Search failed", 
      message: error.message || "Internal server error" 
    }, { status: 500 });
  }
}
