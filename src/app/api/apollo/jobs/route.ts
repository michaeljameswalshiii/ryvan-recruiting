import { NextRequest } from "next/server";
import { logApolloUsage } from "@/lib/aws/athena-bedrock";

// Apollo pricing per result (jobs typically cost more)
const APOLLO_COST_PER_RESULT = 0.01;

export async function POST(request: NextRequest) {
  try {
    const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

    if (!APOLLO_API_KEY) {
      return Response.json({ error: "API key required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { q, title, company_id, location, per_page } = body;

    // Use Apollo's companies search with job keywords as a proxy for open roles
    // In production, you would use a dedicated jobs API or enrich company data
    const searchQuery = q || title || "";
    
    const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q: searchQuery,
        locations: location ? [location] : [],
        per_page: per_page || 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo Jobs Error:", response.status, errorText);
      return Response.json({ error: `Apollo API error ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    
    // Transform companies data into job-like results
    // This is a placeholder - in production you'd use a proper jobs API
    const jobs = (data.companies || []).map((company: any) => ({
      id: company.id,
      title: searchQuery || "Open Role",
      company: company.name,
      company_id: company.id,
      location: company.city && company.state 
        ? `${company.city}, ${company.state}` 
        : company.headquarters_location,
      department: "Engineering",
      description: `${company.name} is hiring ${searchQuery}.`,
      posted_at: new Date().toISOString(),
      url: company.website,
      employees_count: company.employees_count,
      industry: company.industry,
    }));
    
    // Log Apollo usage after successful search
    const resultsCount = jobs.length;
    if (resultsCount > 0) {
      logApolloUsage({
        modelId: 'apollo-jobs-search',
        resultsCount,
        estimatedCost: resultsCount * APOLLO_COST_PER_RESULT,
        queryPreview: searchQuery,
      }).catch(() => {});
    }
    
    return Response.json({ jobs });

  } catch (error: any) {
    console.error("Apollo Jobs Proxy Error:", error);
    return Response.json({ 
      error: "Search failed", 
      message: error.message || "Internal server error" 
    }, { status: 500 });
  }
}
