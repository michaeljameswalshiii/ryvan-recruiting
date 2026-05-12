import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

  console.log("Apollo People Proxy - Key present?", !!APOLLO_API_KEY);

  if (!APOLLO_API_KEY) {
    return Response.json({ 
      error: "Api key required",
      message: "Apollo API key not found in environment variables" 
    }, { status: 400 });
  }

  try {
    const body = await request.json();

    const response = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: errorText || "Apollo API error" }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error: any) {
    console.error("Apollo Proxy Error:", error);
    return Response.json({ error: "Search failed", message: error.message }, { status: 500 });
  }
}
