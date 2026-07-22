/**
 * Minimal server-side Bedrock JSON completion for list-builder batches.
 * @serverOnly
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const region =
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  'us-east-1';

const client = new BedrockRuntimeClient({ region });

const MODEL =
  process.env.LIST_BUILDER_MODEL_ID ||
  'global.anthropic.claude-haiku-4-5-20251001-v1:0';

const FALLBACKS = [
  MODEL,
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'us.anthropic.claude-3-haiku-20240307-v1:0',
];

export async function completeJson<T = unknown>(
  system: string,
  user: string
): Promise<{ data?: T; text?: string; error?: string }> {
  let lastErr = '';
  for (const modelId of FALLBACKS) {
    try {
      const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      };
      const res = await client.send(
        new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(body),
        })
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
      // Extract JSON object or array from markdown fences if present
      const jsonMatch =
        text.match(/```(?:json)?\s*([\s\S]*?)```/i) ||
        text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
      try {
        return { data: JSON.parse(raw) as T, text };
      } catch {
        return { text, error: 'Model returned non-JSON' };
      }
    } catch (err: any) {
      lastErr = err?.message || String(err);
      console.warn('[list-builder/llm]', modelId, lastErr);
    }
  }
  return { error: lastErr || 'LLM failed' };
}
