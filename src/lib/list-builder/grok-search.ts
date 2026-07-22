/**
 * Grok (xAI) client for list-builder: Responses API + server-side web_search.
 * No Apollo / Tavily — Grok does the live search the same way as manual Grok chat.
 * @serverOnly
 */

import { getDecryptedGrokKey } from '@/lib/db/repositories/ai-credentials-repository';
import { logBedrockUsage } from '@/lib/aws/athena-bedrock';

const XAI_BASE = 'https://api.x.ai/v1';

export const LIST_BUILDER_GROK_MODEL =
  process.env.LIST_BUILDER_GROK_MODEL ||
  process.env.GROK_BYOK_MODEL ||
  process.env.XAI_BYOK_MODEL ||
  process.env.GROK_PLATFORM_MODEL ||
  'grok-4.5';

export type GrokSearchUsageCtx = {
  tenantId?: string;
  userId?: string;
  jobId?: string;
  purpose?: string;
  queryPreview?: string;
};

/**
 * Resolve xAI API key: user BYOK first, then platform env.
 */
export async function resolveGrokApiKey(
  userId?: string
): Promise<{ apiKey: string; source: 'byok' | 'env' } | { error: string }> {
  if (userId) {
    try {
      const byok = await getDecryptedGrokKey(userId);
      if (byok && byok.trim().length > 10) {
        return { apiKey: byok.trim(), source: 'byok' };
      }
    } catch (err) {
      console.warn('[list-builder/grok] BYOK decrypt failed', err);
    }
  }

  const envKey = (
    process.env.XAI_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.X_AI_API_KEY ||
    process.env.XAI_KEY ||
    ''
  ).trim();
  if (envKey.length > 10) {
    return { apiKey: envKey, source: 'env' };
  }

  return {
    error:
      'Grok API key required for List Builder search. Add a Grok (xAI) key in Settings → AI Providers, or set XAI_API_KEY on the server.',
  };
}

/** Pull assistant text from Responses API (handles several xAI shapes). */
export function extractGrokOutputText(data: any): string {
  if (!data) return '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  const parts: string[] = [];
  const output = data.output || data.outputs || [];
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item) continue;
      if (item.type === 'message' || item.role === 'assistant') {
        const content = item.content;
        if (typeof content === 'string') {
          parts.push(content);
          continue;
        }
        if (Array.isArray(content)) {
          for (const c of content) {
            if (typeof c === 'string') parts.push(c);
            else if (c?.type === 'output_text' && c.text) parts.push(String(c.text));
            else if (c?.type === 'text' && c.text) parts.push(String(c.text));
            else if (c?.text) parts.push(String(c.text));
          }
        }
      }
      // Some payloads put text on the item itself
      if (typeof item.text === 'string') parts.push(item.text);
    }
  }

  // Chat-completions style fallback
  const choiceText = data.choices?.[0]?.message?.content;
  if (typeof choiceText === 'string' && choiceText.trim()) {
    parts.push(choiceText);
  }

  return parts.join('\n').trim();
}

/**
 * Parse a JSON array/object from model text (fences, trailing prose ok).
 */
export function parseJsonFromText<T = unknown>(
  text: string
): { data?: T; error?: string } {
  if (!text?.trim()) return { error: 'Empty Grok response' };
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  // Prefer array for company lists
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const objMatch = raw.match(/\{[\s\S]*\}/);
  const candidate = arrayMatch?.[0] || objMatch?.[0] || raw;
  try {
    return { data: JSON.parse(candidate) as T };
  } catch {
    return { error: 'Grok returned non-JSON', data: undefined };
  }
}

/**
 * Call Grok Responses API with server-side web_search (agentic, like grok.com).
 */
export async function grokWebResearch(params: {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  timeoutMs?: number;
  usageCtx?: GrokSearchUsageCtx;
  /** Exclude job boards / social noise for BD lists */
  excludedDomains?: string[];
}): Promise<{ text: string; model: string; error?: string }> {
  const model = params.model || LIST_BUILDER_GROK_MODEL;
  const timeoutMs = params.timeoutMs ?? 55_000;
  const started = Date.now();

  const tools: Array<Record<string, unknown>> = [
    {
      type: 'web_search',
      ...(params.excludedDomains?.length
        ? { filters: { excluded_domains: params.excludedDomains.slice(0, 5) } }
        : {}),
    },
  ];

  const body = {
    model,
    input: [
      {
        role: 'system',
        content: params.system,
      },
      {
        role: 'user',
        content: params.user,
      },
    ],
    tools,
    // Encourage tool use then a final answer
    temperature: 0.2,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${XAI_BASE}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.error ||
        rawText.slice(0, 280) ||
        `Grok HTTP ${res.status}`;
      // Fallback: some accounts only have chat/completions + legacy search
      if (res.status === 404 || res.status === 400) {
        return grokChatCompletionsFallback(params, model, timeoutMs - (Date.now() - started));
      }
      return { text: '', model, error: String(msg) };
    }

    const text = extractGrokOutputText(data);
    const usage = data?.usage || {};
    const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || 0) || 0;
    const outputTokens =
      Number(usage.output_tokens || usage.completion_tokens || 0) || 0;

    try {
      await logBedrockUsage({
        modelId: `xai/${model}`,
        inputTokens: inputTokens || Math.ceil((params.system + params.user).length / 4),
        outputTokens: outputTokens || Math.ceil((text || '').length / 4),
        queryPreview: `[List Builder] ${params.usageCtx?.purpose || 'grok-search'}${
          params.usageCtx?.jobId ? ` job=${params.usageCtx.jobId}` : ''
        }: ${(params.usageCtx?.queryPreview || params.user).slice(0, 120)}`.slice(
          0,
          200
        ),
        toolsUsed: ['list-builder', 'grok-web-search', params.usageCtx?.purpose || 'search'],
        latencyMs: Date.now() - started,
        tenantId: params.usageCtx?.tenantId,
        userId: params.usageCtx?.userId,
        provider: 'xai',
      });
    } catch {
      /* usage log never blocks */
    }

    if (!text) {
      return { text: '', model, error: 'Empty Grok response after web search' };
    }
    return { text, model };
  } catch (err: any) {
    const msg =
      err?.name === 'AbortError'
        ? `Grok timed out after ${timeoutMs}ms`
        : err?.message || String(err);
    return { text: '', model, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback if /v1/responses is unavailable: chat/completions without server tools.
 * Still useful as structured reasoning; less accurate than web_search.
 */
async function grokChatCompletionsFallback(
  params: {
    apiKey: string;
    system: string;
    user: string;
    usageCtx?: GrokSearchUsageCtx;
  },
  model: string,
  remainingMs: number
): Promise<{ text: string; model: string; error?: string }> {
  const timeoutMs = Math.max(remainingMs, 12_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        text: '',
        model,
        error: data?.error?.message || data?.error || `Grok chat HTTP ${res.status}`,
      };
    }
    const text =
      data?.choices?.[0]?.message?.content || extractGrokOutputText(data) || '';
    return text
      ? { text, model }
      : { text: '', model, error: 'Empty Grok chat response' };
  } catch (err: any) {
    return {
      text: '',
      model,
      error: err?.message || 'Grok chat fallback failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
