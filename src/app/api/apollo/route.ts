import { NextRequest, NextResponse } from "next/server";

/**
 * API Route: Apollo People Search with Bedrock Fallback
 * ==============================================
 * Tries Apollo API first. If unavailable (rate limit, error), falls back to Bedrock.
 * 
 * Input (POST body):
 * {
 *   "query": "Python developer Miami",  // required for search
 *   "message": "optional message for chat",
 *   "messages": [...],  // conversation history for chat mode
 *   "page": 1,
 *   "per_page": 10
 * }
 * 
 * Output:
 * {
 *   "success": true,
 *   "results": [...],  // Apollo search results
 *   "count": number,
 *   "response": string,  // Bedrock chat response
 *   "source": "apollo" | "bedrock"
 * }
 */

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

/**
 * Get Apollo API key with required check
 * Throws error if not configured
 */
function getApolloApiKey(): string {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY environment variable not set");
  }
  return APOLLO_API_KEY;
}
const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      query, 
      message,
      messages,
      page = 1, 
      per_page = 10 
    } = body;

    // Mode: Search (Apollo) or Chat (Bedrock)
    const isSearchMode = !!query;
    const isChatMode = !!message;

    // === SEARCH MODE: Try Apollo first, then Bedrock ===
    if (isSearchMode) {
      console.log("Searching for:", query, "location:", body.location);

// Try Apollo first
      let response;
      try {
        const apiKey = getApolloApiKey();
        
        response = await fetch(`${APOLLO_BASE_URL}/people/search`, {
          method: "POST",
headers: new Headers({
            "Content-Type": "application/json",
            "Api-Key": apiKey,
          }),
          body: JSON.stringify({
            q: query,
            page: page,
            per_page: per_page,
            ...(body.location && { location: body.location }),
            contact_email_verified: true,
            with_phone_only: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`Apollo error: ${response.status}`);
        }

        const data = await response.json();
        
        // Format results
        const results = data.people?.map((person: any) => ({
          id: person.id,
          name: person.name,
          title: person.title,
          organization: person.organization?.name,
          linkedin_url: person.linkedin_url,
          email: person.email,
          phone: person.phone_number,
          location: person.location,
          headline: person.headline,
          bio: person.bio,
        })) || [];

        return NextResponse.json({
          success: true,
          results,
          count: results.length,
          total: data.total,
          source: "apollo",
        });

      } catch (apolloErr: any) {
        console.error("Apollo failed, falling back to Bedrock:", apolloErr.message);
        
        // Fallback to Bedrock for search
        try {
          const bedrockRes = await fetch(new URL(request.url).origin + "/api/bedrock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: `You are a helpful assistant. The user is asking: "${query}". Provide a helpful response with search results or information they are looking for.`,
                },
                ...(messages?.slice(-6) || []),
                { role: "user", content: query },
              ],
              useSearch: false,
            }),
          });
          
          const bedrockResult = await bedrockRes.json();
          return NextResponse.json({
            success: true,
            results: [],
            response: bedrockResult.response || bedrockResult.error || "Search unavailable",
            count: 0,
            source: "bedrock",
          });
        } catch (bedrockErr: any) {
          console.error("Bedrock fallback failed:", bedrockErr.message);
          return NextResponse.json({
            error: "Both Apollo and Bedrock unavailable",
            details: apolloErr.message,
          }, { status: 503 });
        }
      }
    }

    // === CHAT MODE: Try Apollo first, then Bedrock ===
    if (isChatMode) {
      // Build conversation context
      const chatMessages = [
        {
          role: "system" as const,
          content: "You are a helpful AI assistant. You can help with a wide range of tasks including answering questions, writing, analysis, and more. Be concise and helpful.",
        },
        ...(messages?.slice(-6) || []),
        { role: "user" as const, content: message },
      ];

      // Try Bedrock first for chat (works better for conversation)
      try {
        const bedrockRes = await fetch(new URL(request.url).origin + "/api/bedrock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chatMessages,
            useSearch: false,
          }),
        });

        const bedrockResult = await bedrockRes.json();
        
        if (bedrockResult.response) {
          return NextResponse.json({
            success: true,
            response: bedrockResult.response,
            source: "bedrock",
          });
        }
        
throw new Error(bedrockResult.error || "No response");
      }
      
      catch (bedrockErr: any) {
        console.error("Bedrock failed:", bedrockErr.message);
        
        // Get actual error message from Bedrock response
        const errorMsg = bedrockErr.message || "AI service unavailable";
        
        // Fallback: return actual error for debugging
        return NextResponse.json({
          success: false,
          error: errorMsg,
          response: `AI unavailable: ${errorMsg}. Please check AWS credentials and try again.`,
          source: "fallback",
        });
      }
    }

    // No query or message provided
    return NextResponse.json(
      { error: "Query or message is required" },
      { status: 400 }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process request";
    console.error("Apollo API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
