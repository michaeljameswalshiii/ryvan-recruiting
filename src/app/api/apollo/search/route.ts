import { NextRequest } from "next/server";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("Apollo Proxy - Sending payload:", body); // ← Debug

    const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": APOLLO_API_KEY,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log("Apollo Response Status:", response.status, responseText?.slice(0, 300));

    if (!response.ok) {
      return Response.json({ 
        error: "Apollo API error", 
        status: response.status,
        details: responseText 
      }, { status: response.status });
    }

    return Response.json(JSON.parse(responseText));

  } catch (error: any) {
    console.error("Apollo Proxy Error:", error);
    return Response.json({ 
      error: "Search failed", 
      message: error.message 
    }, { status: 500 });
  }
}
