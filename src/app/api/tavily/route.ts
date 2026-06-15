// Using Tavily API as search backend
// Get your free API key at https://tavily.com/
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TINYFISH_API_URL = "https://api.tavily.com/search";

export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const body = await request.json();
    const { query, max_results = 5 } = body;

    if (!query) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    console.log(`[TAVILY-${requestId}] Query:`, query.substring(0, 50));
    console.log(`[TAVILY-${requestId}] API key present:`, !!TAVILY_API_KEY);
    console.log(`[TAVILY-${requestId}] API key value:`, TAVILY_API_KEY ? `set (${TAVILY_API_KEY.length} chars)` : "NOT SET");

    // If no Tavily API key, return mock results for demo
    if (!TAVILY_API_KEY) {
      console.log(`[TAVILY-${requestId}] No API key - returning demo results`);
      return Response.json({
        results: [
          {
            title: "Demo: Search result for " + query,
            url: "https://example.com",
            snippet: "This is a demo result. Configure TAVILY_API_KEY in your environment to enable real search.",
          },
        ],
      });
    }

    console.log(`[TAVILY-${requestId}] Calling Tavily API...`);
    
    // Call Tavily Search API
    const response = await fetch(TINYFISH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        max_results: max_results,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
      }),
    });

    const responseStatus = response.status;
    console.log(`[TAVILY-${requestId}] Response status:`, responseStatus);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TAVILY-${requestId}] API error:`, responseStatus, errorText);
      return Response.json(
        { error: `Search API error: ${responseStatus}`, details: errorText },
        { status: responseStatus }
      );
    }

    const data = await response.json();
    console.log(`[TAVILY-${requestId}] Results count:`, data.results?.length || 0);

    // Format results for consumption by MiniMax
    const results = data.results?.map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.content || r.snippet || "",
    })) || [];

    // Also include answer if available
    if (data.answer && results.length > 0) {
      results[0].snippet = `[Answer]: ${data.answer}\n\n${results[0].snippet}`;
    }

    console.log(`[TAVILY-${requestId}] Returning ${results.length} results`);
    return Response.json({ results });
  } catch (err: any) {
    console.error(`[TAVILY-${requestId}] Exception:`, err.message || err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
