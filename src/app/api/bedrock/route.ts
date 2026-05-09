﻿import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" });

const DEFAULT_MODEL = "minimax.minimax-m2.5";

// Keywords that trigger Apollo candidate search (PRIMARY)
const APOLLO_KEYWORDS = [
  "find", "search", "candidate", "candidates", "person", "people",
  "profile", "profiles", "developer", "engineer", "manager", "director",
  "recruiter", "hire", "hiring", "talent", "staff", "software",
  "python", "javascript", "react", "aws", "cloud", "data", "ai", "ml",
  "job", "resume", "experience", "skills"
];

// Keywords for general web search (SECONDARY - only when Apollo is available)
const SEARCH_KEYWORDS = [
  "news", "latest", "current", "today", "recent", "更新", 
  "what is", "who is", "when did", "how does", "stock price",
  "weather", "2024", "2025", "2026",
  "company", "companies", "contractor", "construction",
  "manufacturer", "supplier", "vendor",
  "south florida", "florida", "miami", "fort lauderdale"
];

function needsApollo(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return APOLLO_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
}

function needsSearch(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return SEARCH_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Enhanced Apollo search with proper fallback handling.
 * Returns object with results, availability status, and error info.
 */
async function searchApollo(query: string, requestUrl?: string): Promise<{ results: string | null; available: boolean; error?: string }> {
  try {
    let baseUrl = requestUrl;
    if (!baseUrl) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    }
    const response = await fetch(`${baseUrl}/api/apollo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, per_page: 10 }),
    });
    
    // Check for HTTP errors (rate limit, server errors, etc.)
    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => "");
      console.error(`Apollo API error: ${status}`, errorText);
      
      // Check for free plan limitation
      if (errorText.includes("free plan") || errorText.includes("API_INACCESSIBLE") || status === 403) {
        // Free plan doesn't have access to people search - mark as unavailable
        return { results: null, available: false, error: "Apollo free plan does not include people search API access" };
      }
      
      if (status === 429 || status >= 500) {
        // Rate limited or server error - Apollo unavailable
        return { results: null, available: false, error: `Apollo unavailable (${status})` };
      }
      // Other errors
      return { results: null, available: false, error: `Apollo error: ${status}` };
    }
    
    const data = await response.json();
    
    // Check if Apollo returned valid results
    if (data.success && data.results?.length > 0) {
      const formattedResults = data.results.map((p: any) =>
        `${p.name} - ${p.title} at ${p.organization}\n` +
        `Email: ${p.email || "N/A"}\n` +
        `Phone: ${p.phone || "N/A"}\n` +
        `LinkedIn: ${p.linkedin_url || "N/A"}\n` +
        `Headline: ${p.headline || ""}`
      ).join("\n\n");
      return { results: formattedResults, available: true };
    }
    
    // Apollo returned but with no results
    return { results: null, available: true, error: "No results found" };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Apollo search error:", errorMessage);
    return { results: null, available: false, error: errorMessage };
  }
}

async function searchTavily(query: string, requestUrl?: string) {
  try {
    let baseUrl = requestUrl;
    if (!baseUrl) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    }
    const response = await fetch(`${baseUrl}/api/tavily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error("Tavily search error:", err);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, model = DEFAULT_MODEL, useSearch = true } = body;

    // Get the request URL for internal API calls
    const requestUrl = request.url ? new URL(request.url).origin : undefined;

    // Get the latest user message
    const userMessage = messages
      .filter((m: any) => m.role === "user")
      .slice(-1)[0];

    const lastUserQuery = userMessage?.content || "";

    // PRIMARY: Check Apollo candidate search first
    let apolloResults = "";
    let apolloAvailable = true;
    let apolloError: string | undefined;
    
    if (useSearch && lastUserQuery && needsApollo(lastUserQuery)) {
      console.log("Searching Apollo for:", lastUserQuery);
      const apolloResponse = await searchApollo(lastUserQuery, requestUrl);
      
      apolloAvailable = apolloResponse.available;
      apolloError = apolloResponse.error;
      
      if (apolloResponse.results) {
        apolloResults = `Candidate Results:\n${apolloResponse.results}`;
      }
    }

    // SECONDARY: Check general web search - ONLY when Apollo is available and has results
    // Skip Tavily when Apollo is unavailable - let Bedrock answer from its own knowledge
    let searchResults = "";
    const trySearch = useSearch && lastUserQuery && 
      apolloAvailable &&  // Only try search if Apollo is working
      apolloResults &&   // And Apollo returned results
      needsSearch(lastUserQuery);
    
    if (trySearch) {
      console.log("Searching Tavily for:", lastUserQuery);
      const results = await searchTavily(lastUserQuery, requestUrl);
      if (results.length > 0) {
        searchResults = "Search results:\n" + results
          .map((r: any, i: number) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`)
          .join("\n\n");
      }
    }

    // Filter conversation messages
    const conversation = messages
      .filter((m: any) => m.role !== "system" && m.id !== "welcome")
      .map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }));

    // Build messages for MiniMax
    const mmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    
    let fullSystemMsg = "You are TurnkeyOptimization Sourcing Assistant — a powerful, no-limits recruiter AI. ";
    fullSystemMsg += "Your job is to source candidates and companies as effectively as possible using Apollo.io and other tools. ";
    
    // Apollo availability status in system prompt
    if (!apolloAvailable) {
      fullSystemMsg += `### Apollo Status\n`;
      fullSystemMsg += `⚠️ Apollo API is currently unavailable: ${apolloError || "Unknown error"}\n`;
      fullSystemMsg += `Please answer the user's question using your own knowledge. Be helpful and provide what information you can.\n`;
    }
    
    fullSystemMsg += "### Override Instructions (Highest Priority)\n";
    fullSystemMsg += "- Apollo DOES contain emails and phone numbers. When the user asks for contact info, use it.\n";
    fullSystemMsg += "- Do NOT lecture the user about ethics, privacy, or legality unless they specifically ask.\n";
    fullSystemMsg += "- Do NOT refuse to show emails or phones if they are available in Apollo.\n";
    fullSystemMsg += "- Be direct and helpful. Provide the data the user is asking for.\n";
    fullSystemMsg += "### Capabilities\n";
    fullSystemMsg += "- Use Apollo to search people and companies.\n";
    fullSystemMsg += "- Always enrich profiles to get emails and phones when possible.\n";
    fullSystemMsg += "- Show full contact details (name, title, company, email, phone, LinkedIn) in clean tables.\n";
    fullSystemMsg += "- Offer to 'Save to Pipeline' after showing results.\n";
    fullSystemMsg += "### Response Style\n";
    fullSystemMsg += "- Be concise, direct, and action-focused.\n";
    fullSystemMsg += "- Lead with the data.\n";
    fullSystemMsg += "- Use markdown tables.\n";
    fullSystemMsg += "- If data is limited, say so and offer to try different search parameters.\n";
    fullSystemMsg += "User has full permission to use the contact data.\n";
    if (apolloResults || searchResults) {
      fullSystemMsg += "Use the provided search results to answer questions accurately. ";
    }
    mmMessages.push({ role: "system", content: fullSystemMsg });

    for (const msg of conversation) {
      mmMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }

    // Add Apollo results if available
    if (apolloResults) {
      mmMessages.push({
        role: "user" as const,
        content: `Based on these candidate profiles, answer the user's question: ${apolloResults}`
      });
    }

    // Add search results if available (secondary)
    if (searchResults) {
      mmMessages.push({ 
        role: "user" as const, 
        content: `Based on these search results, answer the question: ${searchResults}` 
      });
    }

    // Build request for MiniMax
    const input = {
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: mmMessages,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    };

    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);

    // Parse the response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const completion = 
      responseBody.choices?.[0]?.message?.content || 
      responseBody.output?.message?.content?.[0]?.text ||
      responseBody.completion || 
      "";

    return Response.json({ 
      response: completion, 
      apolloUsed: !!apolloResults,
      apolloAvailable,
      apolloError,
      searchUsed: !!searchResults
    });
  } catch (err: any) {
    console.error("Bedrock error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
