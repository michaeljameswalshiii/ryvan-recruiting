const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function getGroqChatCompletion(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
model: string = "llama-3.3-70b-versatile"
) {
  // Try env var first, fallback to hardcoded for testing
  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || "***REMOVED***";
  
  if (!apiKey) {
    return { error: "GROQ_API_KEY not set" };
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { error: `API error: ${err}` };
    }

    const data = await response.json();
    return { response: data.choices?.[0]?.message?.content || "" };
  } catch (err) {
    return { error: String(err) };
  }
}
