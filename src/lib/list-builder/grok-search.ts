/**
 * List Builder ↔ Grok on Amazon Bedrock Mantle (platform path).
 *
 * Same stack as the AI Assistant when provider=bedrock + Grok:
 *   model id: xai.grok-4.3
 *   endpoint: bedrock-mantle.{region}.api.aws/openai/v1
 *   auth: AWS_ACCESS_KEY_ID / SECRET (or BEDROCK_API_KEY)
 *
 * No direct xAI API key. No Apollo. No Tavily.
 * @serverOnly
 */

import {
  MANTLE_GROK_43,
  runMantleGrokCompletion,
} from '@/lib/ai/providers/bedrock-mantle';
import { logBedrockUsage } from '@/lib/aws/athena-bedrock';

/** Platform Grok model on Bedrock Mantle */
export const LIST_BUILDER_GROK_MODEL =
  process.env.LIST_BUILDER_GROK_MODEL ||
  process.env.GROK_PLATFORM_MODEL ||
  MANTLE_GROK_43;

export type GrokSearchUsageCtx = {
  tenantId?: string;
  userId?: string;
  jobId?: string;
  purpose?: string;
  queryPreview?: string;
};

/**
 * Parse a JSON array/object from model text (fences, trailing prose ok).
 */
export function parseJsonFromText<T = unknown>(
  text: string
): { data?: T; error?: string } {
  if (!text?.trim()) return { error: 'Empty Grok response' };
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const objMatch = raw.match(/\{[\s\S]*\}/);
  const candidate = arrayMatch?.[0] || objMatch?.[0] || raw;
  try {
    return { data: JSON.parse(candidate) as T };
  } catch {
    return { error: 'Grok returned non-JSON' };
  }
}

/**
 * Research call via Grok 4.3 on Bedrock Mantle (no BYOK xAI key).
 */
export async function grokWebResearch(params: {
  system: string;
  user: string;
  model?: string;
  timeoutMs?: number;
  usageCtx?: GrokSearchUsageCtx;
  /** Ignored on Mantle (no native xAI web_search); kept for call-site compat */
  excludedDomains?: string[];
  /** Ignored — Mantle uses AWS credentials */
  apiKey?: string;
}): Promise<{ text: string; model: string; error?: string }> {
  const model = params.model || LIST_BUILDER_GROK_MODEL;
  const timeoutMs = params.timeoutMs ?? 50_000;
  const started = Date.now();

  try {
    const result = await Promise.race([
      runMantleGrokCompletion({
        system: params.system,
        user: params.user,
        model,
        temperature: 0.2,
        maxTokens: 4096,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Grok Mantle timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);

    const text = (result.text || '').trim();
    const usedModel = result.model || model;

    try {
      await logBedrockUsage({
        modelId: usedModel,
        inputTokens: Math.ceil((params.system + params.user).length / 4),
        outputTokens: Math.ceil(text.length / 4),
        queryPreview: `[List Builder] ${params.usageCtx?.purpose || 'grok-mantle'}${
          params.usageCtx?.jobId ? ` job=${params.usageCtx.jobId}` : ''
        }: ${(params.usageCtx?.queryPreview || params.user).slice(0, 120)}`.slice(
          0,
          200
        ),
        toolsUsed: [
          'list-builder',
          'bedrock-mantle-grok',
          params.usageCtx?.purpose || 'research',
        ],
        latencyMs: Date.now() - started,
        tenantId: params.usageCtx?.tenantId,
        userId: params.usageCtx?.userId,
        provider: 'bedrock',
      });
    } catch {
      /* never block on usage log */
    }

    if (!text) {
      return {
        text: '',
        model: usedModel,
        error: 'Empty Grok Mantle response',
      };
    }
    return { text, model: usedModel };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('[list-builder/grok-mantle]', msg);
    return { text: '', model, error: msg };
  }
}

/**
 * Platform path: always available when AWS creds work (no xAI BYOK).
 */
export async function resolveGrokApiKey(
  _userId?: string
): Promise<{ apiKey: string; source: 'mantle' } | { error: string }> {
  // Mantle uses IAM / BEDROCK_API_KEY — no per-user xAI key required.
  // Return a sentinel so call sites that check for a key stay happy.
  const hasAws =
    !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    !!(
      process.env.BEDROCK_API_KEY ||
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      process.env.AWS_BEDROCK_API_KEY
    );

  if (!hasAws) {
    return {
      error:
        'Grok on Bedrock Mantle needs AWS credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY) or BEDROCK_API_KEY.',
    };
  }

  return { apiKey: 'bedrock-mantle', source: 'mantle' };
}
