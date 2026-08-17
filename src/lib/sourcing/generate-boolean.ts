/**
 * Generate Boolean search strings for a job via Claude (Bedrock Haiku).
 * Fast path: one cheap model, short timeout, tag fallback if it stalls.
 * @serverOnly
 */

import { completeJson } from "@/lib/list-builder/llm-json";
import {
  BOOLEAN_PROMPT_VERSION,
  BOOLEAN_SYSTEM_PROMPT,
  buildBooleanJobContext,
  fallbackBooleanStrings,
  parseBooleanText,
  type BooleanCache,
  type BooleanString,
} from "@/lib/sourcing/boolean-prompt";

const BOOLEAN_MODELS = [
  process.env.BOOLEAN_MODEL_ID || "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  "us.anthropic.claude-3-haiku-20240307-v1:0",
];

export type BooleanJobInput = {
  title?: string | null;
  location?: string | null;
  tags?: string[] | null;
  salaryRange?: string | null;
  description?: string | null;
  employmentType?: string | null;
  companyName?: string | null;
  confidential?: boolean | null;
};

export async function generateJobBooleanStrings(params: {
  job: BooleanJobInput;
  tenantId?: string;
  userId?: string;
  jobId?: string;
}): Promise<{ cache: BooleanCache; rawText?: string }> {
  const jobContext = buildBooleanJobContext(params.job);
  let text = "";
  let model = "";

  {
    const result = await completeJson<{ strings?: BooleanString[] }>(
      BOOLEAN_SYSTEM_PROMPT,
      jobContext,
      {
        tenantId: params.tenantId,
        userId: params.userId,
        purpose: "boolean-generator",
        jobId: params.jobId,
        queryPreview: params.job.title || "job boolean",
      },
      {
        modelIds: BOOLEAN_MODELS,
        temperature: 0.3,
        maxTokens: 1600,
        timeoutMs: 12_000,
      }
    );
    if (result.error && !result.text && !result.data) {
      console.warn("[boolean-generator] Claude failed, using tag fallback", result.error);
      return {
        cache: toCache(fallbackBooleanStrings(params.job), "fallback-tags"),
        rawText: result.error,
      };
    }
    model = result.modelId || "claude-sonnet-4-6";
    if (result.data) {
      const fromData = parseBooleanText(JSON.stringify(result.data));
      if (fromData.length) {
        return {
          cache: toCache(fromData, model),
          rawText: result.text,
        };
      }
    }
    text = result.text || "";
  }

  const strings = parseBooleanText(text);
  if (!strings.length) {
    return {
      cache: toCache(fallbackBooleanStrings(params.job), model || "fallback-tags"),
      rawText: text,
    };
  }
  return { cache: toCache(strings, model), rawText: text };
}

function toCache(strings: BooleanString[], model: string): BooleanCache {
  return {
    generatedAt: new Date().toISOString(),
    promptVersion: BOOLEAN_PROMPT_VERSION,
    model,
    strings,
  };
}
