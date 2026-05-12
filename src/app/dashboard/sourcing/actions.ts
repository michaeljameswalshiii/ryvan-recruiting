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

  const response = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apollo Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}
