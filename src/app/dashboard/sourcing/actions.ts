"use server";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

export async function searchCompaniesAction(payload: {
  q: string;
  locations: string[];
  organization_num_employees_ranges?: string[];
  per_page?: number;
}) {
  if (!APOLLO_API_KEY) {
    throw new Error("Apollo API key is not configured. Add APOLLO_API_KEY in Vercel Settings.");
  }

  try {
    // Auto-detect industry from query for smarter filtering
    const query = (payload.q || "").toLowerCase();
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

    const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q: payload.q,
        locations: payload.locations || [],
        organization_num_employees_ranges: payload.organization_num_employees_ranges || ["1-50"],
        per_page: payload.per_page || 20,
        // Stronger filtering
        keywords: payload.q ? [payload.q] : [],
        // Auto-detected industry context
        organization_industries,
        // Filter for smaller/real local companies with contact info
        has_phone_numbers: true,
        has_emails: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Apollo Search Error:", response.status, errorText);
      throw new Error(`Apollo Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Apollo Proxy Full Error:", error);
    throw new Error(error.message || "Search failed: Internal server error");
  }
}
