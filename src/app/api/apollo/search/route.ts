import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

    if (!APOLLO_API_KEY) {
      return Response.json({ error: "Api key required" }, { status: 400 });
    }

const body = await request.json().catch(() => ({}));

    // Auto-detect industry from query for smarter filtering
    const query = (body.q || "").toLowerCase();
    let organization_industries: string[] | undefined;
    if (query.includes("construction")) {
      organization_industries = ["construction"];
    } else if (query.includes("software") || query.includes("tech") || query.includes("it ")) {
      organization_industries = ["software", "information technology"];
    } else if (query.includes("healthcare") || query.includes("medical")) {
      organization_industries = ["healthcare"];
    } else if (query.includes("financial") || query.includes("finance") || query.includes("banking")) {
      organization_industries = ["financial services"];
    } else if (query.includes("real estate")) {
      organization_industries = ["real estate"];
    } else if (query.includes("manufacturing") || query.includes("mfg")) {
      organization_industries = ["manufacturing"];
    } else if (query.includes("retail")) {
      organization_industries = ["retail"];
    } else if (query.includes("marketing")) {
      organization_industries = ["marketing"];
    } else if (query.includes("consulting")) {
      organization_industries = ["consulting"];
    }

// Build search payload with best practices for local/smaller companies
    const payload = {
      q: body.q?.trim() || "",
      locations: body.location ? [body.location] : [],
      organization_num_employees_ranges: body.organization_num_employees_ranges || ["1-100"],
      per_page: 20,

      // === Best practices for better relevance ===
      keywords: body.q ? [body.q.trim()] : [],
      
      organization_industries: body.industry 
        ? [body.industry.toLowerCase()] 
        : organization_industries,

      has_phone_numbers: true,
      has_emails: true,

      // Reduce chance of huge global companies
      max_employee_count: 300,
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
      // Try to parse error details for better messaging
      let errorDetails = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorDetails = parsed.error || parsed.message || parsed.detail || errorText;
      } catch {}
      return Response.json({ error: `Apollo API error ${response.status}`, details: errorDetails }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error: any) {
    console.error("Apollo Proxy Full Error:", error);
    return Response.json({ 
      error: "Search failed", 
      message: error.message || "Internal server error" 
    }, { status: 500 });
  }
}
