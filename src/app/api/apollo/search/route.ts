import { NextRequest } from "next/server";

const APOLLO_API_KEY = process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

export async function POST(request: NextRequest) {
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
    return Response.json({ error: "Failed to fetch from Apollo" }, { status: 500 });
  }
}
