/**
 * Shared OpenAI-compatible chat + tools agent (OpenAI, Grok/xAI, Gemini OpenAI bridge).
 */
import {
  executeTool,
  getToolSchemas,
  type ToolContext,
} from '@/lib/ai/tools';
import { applyApolloPrefire } from '@/lib/ai/apollo-intent';
import {
  crmWriteNudgeForQuery,
  maxIterationsFallback,
  shouldNudgeCrmWrite,
  shouldRetryCrmWrite,
  toolLoopBudget,
  withLinkedInCreateGuidance,
} from '@/lib/ai/crm-write-loop';

const DEFAULT_MAX_ITERATIONS = 6;

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

async function invokeCompatible(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  tools?: ReturnType<typeof toOpenAITools>;
  authHeader?: 'bearer' | 'x-api-key';
}): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
  model: string;
}> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = 'auto';
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (params.authHeader === 'x-api-key') {
    headers['x-api-key'] = params.apiKey;
  } else {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const url = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg = json?.error?.message || json?.error || msg;
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    if (res.status === 401) {
      throw new Error('Invalid API key. Update it in My Settings → Account.');
    }
    if (res.status === 429) {
      throw new Error('Rate limit exceeded. Try again shortly.');
    }
    throw new Error(msg);
  }

  const result = await res.json();
  const choice = result.choices?.[0]?.message;
  return {
    content: choice?.content ?? null,
    tool_calls: choice?.tool_calls,
    model: result.model || params.model,
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

  if (toolName === 'generate_file') {
    const result = await executeTool(
      'generate_file',
      {
        query: String(toolInput.content || toolInput.query || ''),
        format: toolInput.format,
        file_name: toolInput.file_name || toolInput.fileName,
        content: toolInput.content ?? toolInput.body ?? toolInput.text,
        title: toolInput.title,
      } as any,
      toolContext
    );
    if (result.success && result.data) {
      const data = result.data as {
        fileName?: string;
        format?: string;
        sizeBytes?: number;
        message?: string;
        contentBase64?: string;
        mimeType?: string;
        status?: string;
      };
      if (data.contentBase64 && data.fileName) {
        if (!toolContext.generatedFiles) toolContext.generatedFiles = [];
        toolContext.generatedFiles.push({
          fileName: String(data.fileName),
          mimeType: String(data.mimeType || 'application/octet-stream'),
          contentBase64: String(data.contentBase64),
          sizeBytes: Number(data.sizeBytes) || 0,
          format: String(data.format || ''),
        });
      }
      return JSON.stringify({
        status: data.status || 'generated',
        fileName: data.fileName,
        format: data.format,
        sizeBytes: data.sizeBytes,
        message:
          data.message ||
          `File ready: ${data.fileName}. Use the Download button in the app.`,
      });
    }
    return `Error: ${result.error || 'Failed to generate file'}`;
  }

  if (toolName === 'internal_data') {
    const result = await executeTool(
      'internal_data',
      {
        query,
        data_type: toolInput.data_type,
        action: toolInput.action,
        id: toolInput.id,
        company_id: toolInput.company_id,
        filter: toolInput.filter,
        missing_email: toolInput.missing_email,
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
    // generate_file / CRM may attach files on context
    const data = result.data as any;
    if (data?.contentBase64 && data?.fileName && data?.status === 'generated') {
      if (!toolContext.generatedFiles) toolContext.generatedFiles = [];
      toolContext.generatedFiles.push({
        fileName: String(data.fileName),
        mimeType: String(data.mimeType || 'application/octet-stream'),
        contentBase64: String(data.contentBase64),
        sizeBytes: Number(data.sizeBytes) || 0,
        format: String(data.format || ''),
      });
      return JSON.stringify({
        status: 'generated',
        fileName: data.fileName,
        format: data.format,
        sizeBytes: data.sizeBytes,
        message: data.message,
      });
    }
    return JSON.stringify(result.data ?? { ok: true }).slice(0, 8000);
  }
  return `Tool not found or failed: ${toolName} — ${result.error || ''}`;
}

export async function runOpenAiCompatibleByokAgent(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  query: string;
  toolContext: ToolContext;
  systemPrompt?: string;
  useTools?: boolean;
  providerLabel?: string;
}): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  const {
    apiKey,
    baseUrl,
    model,
    query,
    toolContext,
    useTools = true,
    providerLabel = 'AI',
  } = params;

  const systemPrompt =
    params.systemPrompt ||
    `You are a recruiting and business development AI assistant inside Trio ATS (powered by ${providerLabel}).
Specialize in talent sourcing and company research.
Use fetch_website when the user gives a company URL. Use generate_file when they need a downloadable document.
When creating a company from a URL: fetch first; if fetch fails do NOT invent industry/location/description (name+domain only).
Never infer Brazil from "br" inside a domain brand (structuralbr.com is not Brazil; only .br TLD or page text).
Use tools when they help. Be concise and actionable.`;

  const tools = useTools ? toOpenAITools() : undefined;
  const pre = await applyApolloPrefire(
    query,
    withLinkedInCreateGuidance(systemPrompt, query),
    toolContext
  );
  const maxIterations = toolLoopBudget(query, DEFAULT_MAX_ITERATIONS);
  const messages: ChatMessage[] = [
    { role: 'system', content: pre.systemPrompt },
    { role: 'user', content: pre.query },
  ];
  const toolsUsed = new Set<string>(pre.toolsUsed);
  let usedModel = model;

  for (let i = 0; i < maxIterations; i++) {
    if (shouldNudgeCrmWrite(query, i, maxIterations, toolsUsed)) {
      messages.push({ role: 'user', content: crmWriteNudgeForQuery(query) });
    }
    const result = await invokeCompatible({
      apiKey,
      baseUrl,
      model,
      messages,
      tools: useTools ? tools : undefined,
    });
    usedModel = result.model;

    const toolCalls = result.tool_calls || [];
    if (toolCalls.length === 0) {
      const text = result.content || 'No response';
      if (
        shouldRetryCrmWrite(query, toolsUsed) &&
        i < maxIterations - 1
      ) {
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: crmWriteNudgeForQuery(query) });
        continue;
      }
      return {
        text,
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
    text: maxIterationsFallback(query),
    toolsUsed: Array.from(toolsUsed),
    model: usedModel,
  };
}

export async function runOpenAiCompatibleByokChat(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<{ text: string; model: string }> {
  const msgs: ChatMessage[] = [
    { role: 'system', content: params.systemPrompt },
    ...params.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
  ];
  const result = await invokeCompatible({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    messages: msgs,
  });
  return {
    text: result.content || 'No response',
    model: result.model,
  };
}
