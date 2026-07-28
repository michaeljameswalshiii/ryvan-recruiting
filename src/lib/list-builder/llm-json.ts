/**
 * Minimal server-side Bedrock JSON completion for list-builder batches.
 * Logs each successful invoke to the shared AI Usage dashboard.
 * @serverOnly
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { logBedrockUsage } from '@/lib/aws/athena-bedrock';

const region =
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  'us-east-1';

const client = new BedrockRuntimeClient({ region });

/** List-builder / generic JSON batches — cheap & fast */
const MODEL =
  process.env.LIST_BUILDER_MODEL_ID ||
  'global.anthropic.claude-haiku-4-5-20251001-v1:0';

const FALLBACKS = [
  MODEL,
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'us.anthropic.claude-3-haiku-20240307-v1:0',
];

/**
 * Fill-job Apollo plan + re-rank — Sonnet quality (cost/quality blend).
 * Does not change list-builder Haiku defaults.
 *
 * Env:
 *   FILL_JOB_PLAN_MODEL_ID   — JD → Apollo filters (default Sonnet 4.6)
 *   FILL_JOB_RERANK_MODEL_ID — shortlist scoring (defaults to plan model)
 *   AI_MODEL                 — shared product default if plan env unset
 */
export const FILL_JOB_PLAN_MODEL =
  process.env.FILL_JOB_PLAN_MODEL_ID ||
  process.env.AI_MODEL ||
  'global.anthropic.claude-sonnet-4-6';

export const FILL_JOB_RERANK_MODEL =
  process.env.FILL_JOB_RERANK_MODEL_ID ||
  process.env.FILL_JOB_PLAN_MODEL_ID ||
  process.env.AI_MODEL ||
  'global.anthropic.claude-sonnet-4-6';

const SONNET_FALLBACKS = [
  'global.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-sonnet-4-6-20250219',
];

function dedupeModels(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const t = (id || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Model chain for Fill-job Apollo plan (Sonnet first, Haiku last-resort). */
export function fillJobPlanModelChain(): string[] {
  return dedupeModels([
    FILL_JOB_PLAN_MODEL,
    ...SONNET_FALLBACKS,
    MODEL,
    'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  ]);
}

/** Model chain for Fill-job candidate re-rank. */
export function fillJobRerankModelChain(): string[] {
  return dedupeModels([
    FILL_JOB_RERANK_MODEL,
    ...SONNET_FALLBACKS,
    MODEL,
    'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  ]);
}

export type ListBuilderLlmUsageContext = {
  tenantId?: string;
  userId?: string;
  /** Short label for Recent Activity, e.g. discover | extract */
  purpose?: string;
  jobId?: string;
  queryPreview?: string;
};

export type CompleteJsonOptions = {
  timeoutMs?: number;
  /**
   * Override model chain (first success wins).
   * Omit → list-builder Haiku chain.
   * Use fillJobPlanModelChain() / fillJobRerankModelChain() for Fill job.
   */
  modelIds?: string[];
  temperature?: number;
  maxTokens?: number;
};

function estimateTokens(text: string): number {
  // ~4 chars/token heuristic (same spirit as /api/bedrock)
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function extractUsage(
  parsed: any,
  system: string,
  user: string,
  text: string
): { inputTokens: number; outputTokens: number } {
  const u = parsed?.usage || parsed?.amazon_bedrock_invocationMetrics;
  const input =
    Number(u?.input_tokens ?? u?.inputTokens ?? u?.prompt_tokens) || 0;
  const output =
    Number(u?.output_tokens ?? u?.outputTokens ?? u?.completion_tokens) || 0;
  if (input > 0 || output > 0) {
    return {
      inputTokens: input || estimateTokens(system + user),
      outputTokens: output || estimateTokens(text),
    };
  }
  return {
    inputTokens: estimateTokens(system + '\n' + user),
    outputTokens: estimateTokens(text),
  };
}

async function logListBuilderUsage(params: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ctx?: ListBuilderLlmUsageContext;
  system: string;
  user: string;
}): Promise<void> {
  const purpose = (params.ctx?.purpose || 'list-builder').trim();
  const jobBit = params.ctx?.jobId ? ` job=${params.ctx.jobId}` : '';
  const previewBase =
    params.ctx?.queryPreview ||
    params.user.replace(/\s+/g, ' ').trim().slice(0, 120);
  try {
    await logBedrockUsage({
      modelId: params.modelId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      queryPreview: `[List Builder] ${purpose}${jobBit}: ${previewBase}`.slice(
        0,
        200
      ),
      toolsUsed: ['list-builder', purpose],
      latencyMs: params.latencyMs,
      tenantId: params.ctx?.tenantId,
      userId: params.ctx?.userId,
      provider: 'bedrock',
    });
  } catch (err) {
    // Never fail the agent batch because usage logging failed
    console.warn('[list-builder/llm] usage log failed', err);
  }
}

const DEFAULT_LLM_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function completeJson<T = unknown>(
  system: string,
  user: string,
  usageCtx?: ListBuilderLlmUsageContext,
  options?: CompleteJsonOptions
): Promise<{ data?: T; text?: string; error?: string; modelId?: string }> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const modelIds =
    options?.modelIds?.length ? options.modelIds : FALLBACKS;
  const temperature =
    typeof options?.temperature === 'number' ? options.temperature : 0.3;
  const maxTokens =
    typeof options?.maxTokens === 'number' ? options.maxTokens : 4096;
  let lastErr = '';
  for (const modelId of modelIds) {
    const started = Date.now();
    try {
      const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      };
      const res = await withTimeout(
        client.send(
          new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(body),
          })
        ),
        timeoutMs,
        `Bedrock ${modelId}`
      );
      const parsed = JSON.parse(new TextDecoder().decode(res.body));
      const text: string =
        parsed?.content?.find((c: any) => c.type === 'text')?.text ||
        parsed?.content?.[0]?.text ||
        '';
      if (!text) {
        lastErr = 'Empty model response';
        continue;
      }

      const { inputTokens, outputTokens } = extractUsage(
        parsed,
        system,
        user,
        text
      );
      // Fire-and-forget style but awaited so serverless doesn't freeze mid-log
      await logListBuilderUsage({
        modelId,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        ctx: usageCtx,
        system,
        user,
      });

      // Extract JSON object or array from markdown fences if present
      const jsonMatch =
        text.match(/```(?:json)?\s*([\s\S]*?)```/i) ||
        text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
      try {
        return { data: JSON.parse(raw) as T, text, modelId };
      } catch {
        return { text, error: 'Model returned non-JSON', modelId };
      }
    } catch (err: any) {
      lastErr = err?.message || String(err);
      console.warn('[list-builder/llm]', modelId, lastErr);
    }
  }
  return { error: lastErr || 'LLM failed' };
}
