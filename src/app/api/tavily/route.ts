// Using Tavily API as search backend
// Get your free API key at https://tavily.com/
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TINYFISH_API_URL = "https://api.tavily.com/search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    // If no Tavily API key, return mock results for demo
    if (!TAVILY_API_KEY) {
      console.log("No Tavily API key configured, returning demo search results");
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

    // Call Tavily Search API
    const response = await fetch(TINYFISH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        max_results: 5,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Tavily API error:", response.status, errorText);
      return Response.json(
        { error: `Search API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

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

    return Response.json({ results });
  } catch (err: any) {
    console.error("Search error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
