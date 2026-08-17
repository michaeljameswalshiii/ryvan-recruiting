/**
 * Generate Boolean search strings for a job via Claude (Bedrock or Anthropic BYOK).
 * @serverOnly
 */

import { completeJson, fillJobPlanModelChain } from "@/lib/list-builder/llm-json";
import {
  getAiCredentialsPublic,
  getDecryptedAnthropicKey,
} from "@/lib/db/repositories/ai-credentials-repository";
import { runAnthropicByokChat } from "@/lib/ai/providers/anthropic-byok";
import {
  BOOLEAN_PROMPT_VERSION,
  BOOLEAN_SYSTEM_PROMPT,
  buildBooleanJobContext,
  fallbackBooleanStrings,
  parseBooleanText,
  type BooleanCache,
  type BooleanString,
} from "@/lib/sourcing/boolean-prompt";

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

  const byok = await tryAnthropicByok(params.userId, jobContext);
  if (byok) {
    const fromByok = parseBooleanText(byok.text);
    if (fromByok.length) {
      return { cache: toCache(fromByok, byok.model), rawText: byok.text };
    }
  }

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
        modelIds: fillJobPlanModelChain(),
        temperature: 0.3,
        maxTokens: 2000,
        timeoutMs: 45_000,
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

async function tryAnthropicByok(
  userId: string | undefined,
  jobContext: string
): Promise<{ text: string; model: string } | null> {
  if (!userId) return null;
  try {
    const prefs = await getAiCredentialsPublic(userId);
    if (prefs.preferredProvider !== "anthropic" || !prefs.hasAnthropicKey) {
      return null;
    }
    const apiKey = await getDecryptedAnthropicKey(userId);
    if (!apiKey) return null;
    const result = await runAnthropicByokChat({
      apiKey,
      systemPrompt: BOOLEAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: jobContext }],
      model: process.env.ANTHROPIC_BYOK_MODEL || "claude-sonnet-4-20250514",
    });
    return { text: result.text, model: result.model };
  } catch (err) {
    console.warn("[boolean-generator] Anthropic BYOK failed, falling back", err);
    return null;
  }
}

function toCache(strings: BooleanString[], model: string): BooleanCache {
  return {
    generatedAt: new Date().toISOString(),
    promptVersion: BOOLEAN_PROMPT_VERSION,
    model,
    strings,
  };
}
