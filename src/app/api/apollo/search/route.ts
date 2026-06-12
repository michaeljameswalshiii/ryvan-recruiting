import { NextRequest } from "next/server";
import { logApolloUsage } from "@/lib/aws/athena-bedrock";
import { expandQuery } from "@/lib/apollo/query-expander";

const APOLLO_COST_PER_RESULT = 0.01;

export async function POST(request: NextRequest) {
  try {
    const APOLLO_API_KEY = process.env.APOLLO_API_KEY || "";

    if (!APOLLO_API_KEY) {
      return Response.json({ error: "Api key required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rawQuery = (body.q || "").trim();

    // === NEW: AI Query Expansion ===
    let expanded;
    try {
      expanded = await expandQuery(rawQuery);
      console.log("🔍 AI Expanded Query:", expanded);
    } catch (err) {
      console.warn("Query expansion failed, falling back to raw query", err);
      expanded = { q: rawQuery };
    }

    // Build Apollo payload from expanded query
    const payload = {
      q: expanded.q || rawQuery,
      locations: expanded.locations || (body.location ? [body.location] : []),
      organization_num_employees_ranges: expanded.organization_num_employees_ranges || body.organization_num_employees_ranges || ["1-100"],
      per_page: 20,

      keywords: expanded.keywords || (rawQuery ? [rawQuery] : []),
      organization_industries: expanded.organization_industries || (body.industry ? [body.industry.toLowerCase()] : undefined),

      titles: expanded.titles || undefined,
      seniorities: expanded.seniorities || undefined,

      has_phone_numbers: expanded.has_phone_numbers ?? true,
      has_emails: expanded.has_emails ?? true,
      max_employee_count: expanded.max_employee_count ?? 300,
    };

    const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo Error:", response.status, errorText);
      return Response.json({ error: `Apollo API error ${response.status}` }, { status: response.status });
    }

    const data = await response.json();

    // Log usage
    const resultsCount = data.organizations?.length || 0;
    if (resultsCount > 0) {
      logApolloUsage({
        modelId: 'apollo-company-search',
        resultsCount,
        estimatedCost: resultsCount * APOLLO_COST_PER_RESULT,
        queryPreview: rawQuery,
      }).catch(() => {});
    }

    return Response.json(data);

  } catch (error: any) {
    console.error("Apollo Proxy Full Error:", error);
    return Response.json({ error: "Search failed", message: error.message }, { status: 500 });
  }
}
