/**
 * Anthropic direct API (BYOK) with the same tool-calling agent loop as Bedrock.
 * Uses fetch — no extra npm package required.
 */
import {
  executeTool,
  getToolSchemas,
  type ToolContext,
} from '@/lib/ai/tools';

export type ClaudeContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContent[];
}

const DEFAULT_MODEL =
  process.env.ANTHROPIC_BYOK_MODEL || 'claude-sonnet-4-20250514';
const MAX_ITERATIONS = 5;

async function invokeAnthropic(params: {
  apiKey: string;
  model?: string;
  system: string;
  messages: AnthropicMessage[];
  tools?: ReturnType<typeof getToolSchemas>;
}): Promise<{ content: ClaudeContent[]; stop_reason?: string; usage?: any }> {
  const { apiKey, system, messages, tools } = params;
  const model = params.model || DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    temperature: 0.7,
    system,
    messages,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Anthropic API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg = json?.error?.message || msg;
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    if (res.status === 401) {
      throw new Error('Invalid Anthropic API key. Update it in Settings → AI Providers.');
    }
    if (res.status === 429) {
      throw new Error('Anthropic rate limit exceeded. Try again shortly.');
    }
    throw new Error(msg);
  }

  const result = await res.json();
  return {
    content: (result.content || []) as ClaudeContent[],
    stop_reason: result.stop_reason,
    usage: result.usage,
  };
}

async function executeToolByName(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolContext: ToolContext
): Promise<string> {
  const query = (toolInput.query as string) || '';

  if (toolName === 'apollo' || toolName === 'apollo_people') {
    const result = await executeTool(
      'apollo',
      { query, per_page: (toolInput.per_page as number) || 10 },
      toolContext
    );
    if (result.success && result.data) {
      const data = result.data as {
        candidates?: Array<{
          name: string;
          email?: string;
          phone?: string;
          linkedin_url?: string;
          title?: string;
          organization?: string;
        }>;
      };
      if (data.candidates?.length) {
        return data.candidates
          .slice(0, 10)
          .map(
            (p) =>
              `${p.name} - ${p.title || ''} at ${p.organization || ''}\nEmail: ${p.email || 'N/A'}\nPhone: ${p.phone || 'N/A'}\nLinkedIn: ${p.linkedin_url || 'N/A'}`
          )
          .join('\n\n');
      }
      return 'No candidates found';
    }
    return `Error: ${result.error || 'Unknown error'}`;
  }

  if (toolName === 'tavily') {
    const result = await executeTool(
      'tavily',
      { query, max_results: (toolInput.max_results as number) || 5 },
      toolContext
    );
    if (result.success && result.data) {
      const data = result.data as {
        results?: Array<{ title: string; snippet: string }>;
      };
      if (data.results?.length) {
        return data.results
          .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}`)
          .join('\n\n');
      }
      return 'No results found';
    }
    return `Error: ${result.error || 'Unknown error'}`;
  }

  if (toolName === 'fetch_website') {
    const url =
      (toolInput.url as string) ||
      (toolInput.query as string) ||
      query ||
      '';
    const result = await executeTool(
      'fetch_website',
      { query: url, url } as any,
      toolContext
    );
    if (result.success && result.data) {
      const data = result.data as {
        finalUrl?: string;
        url?: string;
        title?: string;
        text?: string;
        truncated?: boolean;
      };
      return [
        `URL: ${data.finalUrl || data.url || url}`,
        data.title ? `Title: ${data.title}` : null,
        data.truncated ? '(content truncated)' : null,
        '',
        data.text || '',
      ]
        .filter((x) => x !== null)
        .join('\n');
    }
    return `Error: ${result.error || 'Failed to fetch website'}`;
  }

  if (toolName === 'internal_data') {
    const result = await executeTool(
      'internal_data',
      {
        query,
        data_type: toolInput.data_type,
        action: toolInput.action,
      } as any,
      toolContext
    );
    if (result.success) {
      return JSON.stringify(result.data ?? result, null, 2).slice(0, 8000);
    }
    return `Error: ${result.error || 'Unknown error'}`;
  }

  // Fallback: try registry name as-is
  const result = await executeTool(
    toolName,
    { query, ...toolInput } as any,
    toolContext
  );
  if (result.success) {
    return JSON.stringify(result.data ?? { ok: true }).slice(0, 8000);
  }
  return `Tool not found or failed: ${toolName} — ${result.error || ''}`;
}

/**
 * Run tool-using agent on Anthropic with user's API key.
 */
export async function runAnthropicByokAgent(params: {
  apiKey: string;
  query: string;
  toolContext: ToolContext;
  systemPrompt?: string;
  model?: string;
  useTools?: boolean;
}): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  const {
    apiKey,
    query,
    toolContext,
    useTools = true,
  } = params;

  const model = params.model || DEFAULT_MODEL;
  const systemPrompt =
    params.systemPrompt ||
    `You are a recruiting and business development AI assistant inside Trio ATS.
Specialize in talent sourcing and company research.
Use fetch_website when the user gives a company URL or asks you to examine a website — do not claim you cannot open URLs.
When creating a company from a URL: fetch first; if fetch fails do NOT invent industry/location/description (name+domain only).
Never infer Brazil from "br" inside a domain brand (structuralbr.com is not Brazil; only .br TLD or page text).
Use tools when they help. Be concise and actionable.`;

  const tools = useTools ? getToolSchemas() : [];
  let messages: AnthropicMessage[] = [{ role: 'user', content: query }];
  const toolsUsed = new Set<string>();

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await invokeAnthropic({
      apiKey,
      model,
      system: systemPrompt,
      messages,
      tools: useTools ? tools : undefined,
    });

    const content = result.content || [];
    const toolUses = content.filter(
      (c): c is ClaudeContent & { type: 'tool_use' } =>
        typeof c === 'object' && c.type === 'tool_use'
    );

    if (toolUses.length === 0) {
      const textBlock = content.find(
        (c): c is ClaudeContent & { type: 'text' } =>
          typeof c === 'object' && c.type === 'text'
      );
      return {
        text: textBlock?.text || 'No response',
        toolsUsed: Array.from(toolsUsed),
        model,
      };
    }

    // Execute tools in parallel
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        toolsUsed.add(tu.name);
        try {
          const out = await executeToolByName(tu.name, tu.input || {}, toolContext);
          return {
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: out,
          };
        } catch (err) {
          return {
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: `Error: ${err instanceof Error ? err.message : 'failed'}`,
          };
        }
      })
    );

    messages = [
      ...messages,
      { role: 'assistant', content },
      { role: 'user', content: toolResults },
    ];
  }

  return {
    text: 'Maximum tool iterations reached. Please refine your query.',
    toolsUsed: Array.from(toolsUsed),
    model,
  };
}

/**
 * Simple chat (no tools) for assistant mode.
 */
export async function runAnthropicByokChat(params: {
  apiKey: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  model?: string;
}): Promise<{ text: string; model: string }> {
  const model = params.model || DEFAULT_MODEL;
  const result = await invokeAnthropic({
    apiKey: params.apiKey,
    model,
    system:
      params.systemPrompt ||
      'You are a helpful AI assistant for a recruiting ATS. Be concise and practical.',
    messages: params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = result.content.find(
    (c): c is ClaudeContent & { type: 'text' } =>
      typeof c === 'object' && c.type === 'text'
  );

  return { text: textBlock?.text || 'No response', model };
}
