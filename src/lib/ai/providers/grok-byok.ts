/**
 * Grok (xAI) BYOK — OpenAI-compatible chat completions + tool calling.
 * Base: https://api.x.ai/v1
 */
import {
  executeTool,
  getToolSchemas,
  type ToolContext,
} from '@/lib/ai/tools';

const XAI_BASE = 'https://api.x.ai/v1';
/** Default xAI model — Grok 4.3 preferred for agentic / tool work */
export const GROK_DEFAULT_MODEL =
  process.env.GROK_BYOK_MODEL ||
  process.env.XAI_BYOK_MODEL ||
  process.env.GROK_PLATFORM_MODEL ||
  'grok-4.3';
const DEFAULT_MODEL = GROK_DEFAULT_MODEL;
const MAX_ITERATIONS = 5;

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

function toOpenAITools() {
  return getToolSchemas().map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

async function invokeGrok(params: {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  tools?: ReturnType<typeof toOpenAITools>;
}): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
  model: string;
}> {
  const model = params.model || DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `Grok/xAI API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg = json?.error?.message || json?.error || msg;
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    if (res.status === 401) {
      throw new Error(
        'Invalid Grok/xAI API key. Update it in Settings → AI Providers.'
      );
    }
    if (res.status === 429) {
      throw new Error('Grok rate limit exceeded. Try again shortly.');
    }
    throw new Error(msg);
  }

  const result = await res.json();
  const choice = result.choices?.[0]?.message;
  return {
    content: choice?.content ?? null,
    tool_calls: choice?.tool_calls,
    model: result.model || model,
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

export async function runGrokByokAgent(params: {
  apiKey: string;
  query: string;
  toolContext: ToolContext;
  systemPrompt?: string;
  model?: string;
  useTools?: boolean;
  /** Prior turns for multi-turn General AI */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  const { apiKey, query, toolContext, useTools = true } = params;
  const model = params.model || DEFAULT_MODEL;
  const systemPrompt =
    params.systemPrompt ||
    `You are a recruiting and business development AI assistant inside Trio ATS (powered by Grok).
Specialize in talent sourcing and company research.
Use fetch_website when the user gives a company URL or asks you to examine a website — do not claim you cannot open URLs.
Use tools when they help. Be concise and actionable.`;

  const tools = useTools ? toOpenAITools() : undefined;
  const prior = (params.history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-20)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...prior,
    { role: 'user', content: query },
  ];
  const toolsUsed = new Set<string>();
  let usedModel = model;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await invokeGrok({
      apiKey,
      model,
      messages,
      tools: useTools ? tools : undefined,
    });
    usedModel = result.model;

    const toolCalls = result.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        text: result.content || 'No response',
        toolsUsed: Array.from(toolsUsed),
        model: usedModel,
      };
    }

    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      toolsUsed.add(tc.function.name);
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || '{}');
      } catch {
        input = { query: tc.function.arguments || '' };
      }
      try {
        const out = await executeToolByName(
          tc.function.name,
          input,
          toolContext
        );
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: out,
        });
      } catch (err) {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `Error: ${err instanceof Error ? err.message : 'failed'}`,
        });
      }
    }
  }

  return {
    text: 'Maximum tool iterations reached. Please refine your query.',
    toolsUsed: Array.from(toolsUsed),
    model: usedModel,
  };
}

export async function runGrokByokChat(params: {
  apiKey: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  model?: string;
}): Promise<{ text: string; model: string }> {
  const model = params.model || DEFAULT_MODEL;
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        params.systemPrompt ||
        'You are a helpful AI assistant for a recruiting ATS (Grok). Be concise and practical.',
    },
    ...params.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const result = await invokeGrok({ apiKey: params.apiKey, model, messages });
  return { text: result.content || 'No response', model: result.model };
}
