/**
 * OpenAI BYOK — chat completions + tool calling
 */
import type { ToolContext } from '@/lib/ai/tools';
import {
  runOpenAiCompatibleByokAgent,
  runOpenAiCompatibleByokChat,
} from './openai-compatible-byok';

const OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = process.env.OPENAI_BYOK_MODEL || 'gpt-4o';

export async function runOpenaiByokAgent(params: {
  apiKey: string;
  query: string;
  toolContext: ToolContext;
  systemPrompt?: string;
  model?: string;
  useTools?: boolean;
}): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  return runOpenAiCompatibleByokAgent({
    apiKey: params.apiKey,
    baseUrl: OPENAI_BASE,
    model: params.model || DEFAULT_MODEL,
    query: params.query,
    toolContext: params.toolContext,
    systemPrompt: params.systemPrompt,
    useTools: params.useTools,
    providerLabel: 'OpenAI',
  });
}

export async function runOpenaiByokChat(params: {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<{ text: string; model: string }> {
  return runOpenAiCompatibleByokChat({
    apiKey: params.apiKey,
    baseUrl: OPENAI_BASE,
    model: params.model || DEFAULT_MODEL,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
  });
}
