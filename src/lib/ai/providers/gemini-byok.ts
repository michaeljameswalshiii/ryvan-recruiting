/**
 * Google Gemini BYOK via OpenAI-compatible endpoint
 * https://generativelanguage.googleapis.com/v1beta/openai/
 */
import type { ToolContext } from '@/lib/ai/tools';
import {
  runOpenAiCompatibleByokAgent,
  runOpenAiCompatibleByokChat,
} from './openai-compatible-byok';

const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = process.env.GEMINI_BYOK_MODEL || 'gemini-2.0-flash';

export async function runGeminiByokAgent(params: {
  apiKey: string;
  query: string;
  toolContext: ToolContext;
  systemPrompt?: string;
  model?: string;
  useTools?: boolean;
}): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  return runOpenAiCompatibleByokAgent({
    apiKey: params.apiKey,
    baseUrl: GEMINI_BASE,
    model: params.model || DEFAULT_MODEL,
    query: params.query,
    toolContext: params.toolContext,
    systemPrompt: params.systemPrompt,
    useTools: params.useTools,
    providerLabel: 'Google Gemini',
  });
}

export async function runGeminiByokChat(params: {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<{ text: string; model: string }> {
  return runOpenAiCompatibleByokChat({
    apiKey: params.apiKey,
    baseUrl: GEMINI_BASE,
    model: params.model || DEFAULT_MODEL,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
  });
}
