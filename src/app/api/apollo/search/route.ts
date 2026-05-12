import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  // Try both possible variable names
  const APOLLO_API_KEY = process.env.APOLLO_API_KEY || 
                        process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

  console.log("🔑 Apollo Proxy Debug - Key exists?", !!APOLLO_API_KEY, "Length:", APOLLO_API_KEY.length);

  if (!APOLLO_API_KEY) {
    return Response.json({ 
      error: "Api key required",
      message: "Add APOLLO_API_KEY or NEXT_PUBLIC_APOLLO_API_KEY in Vercel Settings"
    }, { status: 400 });
  }

  try {
    const body = await request.json();

    const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error: any) {
    console.error("Apollo Proxy Error:", error);
    return Response.json({ error: error.message || "Search failed" }, { status: 500 });
  }
}
