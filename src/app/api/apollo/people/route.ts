import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

    if (!APOLLO_API_KEY) {
      return Response.json({ error: "Api key required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));

const response = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q: body.q,
        locations: body.locations || [],
        per_page: body.per_page || 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Apollo People Error:", response.status, errorText);
      return Response.json({ error: `Apollo API error ${response.status}` }, { status: response.status });
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
