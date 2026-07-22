/**
 * Amazon Bedrock Mantle — OpenAI-compatible inference endpoint.
 *
 * Grok 4.3 (xai.grok-4.3) runs on Mantle, NOT bedrock-runtime Converse/Invoke.
 * Endpoint: https://bedrock-mantle.{region}.api.aws/openai/v1
 *
 * Auth (either works):
 *  1) Bedrock API key — BEDROCK_API_KEY / AWS_BEARER_TOKEN_BEDROCK as Bearer
 *  2) IAM — AWS_ACCESS_KEY_ID + SECRET via SigV4 (service: bedrock)
 *
 * @serverOnly
 */

import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  executeTool,
  getToolSchemas,
  type ToolContext,
} from "@/lib/ai/tools";

export const MANTLE_GROK_43 = "xai.grok-4.3";

const MAX_ITERATIONS = 5;

function mantleRegion(): string {
  return (
    process.env.BEDROCK_MANTLE_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1"
  );
}

export function mantleBaseUrl(region = mantleRegion()): string {
  return (
    process.env.BEDROCK_MANTLE_BASE_URL?.replace(/\/$/, "") ||
    `https://bedrock-mantle.${region}.api.aws/openai/v1`
  );
}

function bedrockApiKey(): string {
  return (
    process.env.BEDROCK_API_KEY?.trim() ||
    process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() ||
    process.env.AWS_BEDROCK_API_KEY?.trim() ||
    ""
  );
}

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

function toOpenAITools() {
  return getToolSchemas().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

async function signedFetch(
  url: string,
  body: string,
  region: string
): Promise<Response> {
  const apiKey = bedrockApiKey();
  if (apiKey) {
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
  }

  const parsed = new URL(url);
  const credentials = await defaultProvider()();
  const signer = new SignatureV4({
    credentials,
    region,
    service: "bedrock",
    sha256: Sha256,
  });

  const request = new HttpRequest({
    method: "POST",
    protocol: "https:",
    hostname: parsed.hostname,
    path: parsed.pathname + (parsed.search || ""),
    headers: {
      host: parsed.hostname,
      "content-type": "application/json",
      accept: "application/json",
    },
    body,
  });

  const signed = await signer.sign(request);
  return fetch(url, {
    method: "POST",
    headers: signed.headers as Record<string, string>,
    body,
  });
}

async function invokeMantleChat(params: {
  model: string;
  messages: ChatMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
  model: string;
}> {
  const region = mantleRegion();
  const url = `${mantleBaseUrl(region)}/chat/completions`;
  const bodyObj: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 4096,
  };
  if (params.tools?.length) {
    bodyObj.tools = params.tools;
    bodyObj.tool_choice = "auto";
  }

  const body = JSON.stringify(bodyObj);
  const res = await signedFetch(url, body, region);

  if (!res.ok) {
    const text = await res.text();
    let msg = `Bedrock Mantle error (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg =
        json?.error?.message ||
        json?.message ||
        json?.error ||
        (typeof json === "string" ? json : msg);
    } catch {
      if (text) msg = text.slice(0, 500);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `${msg}. For Mantle/Grok: set BEDROCK_API_KEY (Bedrock console API key) or ensure IAM can invoke bedrock-mantle. Model: ${params.model}`
      );
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
  const query = (toolInput.query as string) || "";
  const result = await executeTool(
    toolName,
    { query, ...toolInput } as any,
    toolContext
  );
  if (result.success) {
    return JSON.stringify(result.data ?? { ok: true }).slice(0, 8000);
  }
  return `Tool failed: ${toolName} — ${result.error || "unknown"}`;
}

export async function runMantleGrokChat(params: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  systemPrompt?: string;
  model?: string;
}): Promise<{ text: string; model: string }> {
  const model = params.model || MANTLE_GROK_43;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        params.systemPrompt ||
        "You are a helpful AI assistant for Trio Recruiting (Grok 4.3 on Amazon Bedrock Mantle).",
    },
    ...params.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
  const result = await invokeMantleChat({ model, messages });
  return { text: result.content || "No response", model: result.model };
}

/**
 * Single-shot Grok completion on Bedrock Mantle (no app tools).
 * Used by List Builder for company discovery / contact JSON.
 */
export async function runMantleGrokCompletion(params: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; model: string }> {
  const model = params.model || MANTLE_GROK_43;
  const result = await invokeMantleChat({
    model,
    temperature: params.temperature ?? 0.25,
    maxTokens: params.maxTokens ?? 4096,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });
  return { text: result.content || "", model: result.model };
}

export async function runMantleGrokAgent(params: {
  query: string;
  toolContext: ToolContext;
  systemPrompt?: string;
  model?: string;
  useTools?: boolean;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ text: string; toolsUsed: string[]; model: string }> {
  const model = params.model || MANTLE_GROK_43;
  const useTools = params.useTools !== false;
  const systemPrompt =
    params.systemPrompt ||
    `You are a recruiting AI assistant on Grok 4.3 via Amazon Bedrock Mantle.
Use tools when they improve the answer. Be concise and actionable.`;

  const prior = (params.history || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-20);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...prior.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: params.query },
  ];

  const tools = useTools ? toOpenAITools() : undefined;
  const toolsUsed = new Set<string>();
  let usedModel = model;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await invokeMantleChat({
      model,
      messages,
      tools: useTools ? tools : undefined,
    });
    usedModel = result.model;
    const toolCalls = result.tool_calls || [];

    if (!toolCalls.length) {
      return {
        text: result.content || "No response",
        toolsUsed: Array.from(toolsUsed),
        model: usedModel,
      };
    }

    messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      toolsUsed.add(tc.function.name);
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = { query: tc.function.arguments || "" };
      }
      try {
        const out = await executeToolByName(
          tc.function.name,
          input,
          params.toolContext
        );
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: out,
        });
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Error: ${err instanceof Error ? err.message : "failed"}`,
        });
      }
    }
  }

  return {
    text: "Maximum tool iterations reached. Please refine your query.",
    toolsUsed: Array.from(toolsUsed),
    model: usedModel,
  };
}

/** OpenAI-style tool def for scoped Mantle agent loops */
export type MantleOpenAiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * Mantle Grok agent with an explicit allow-list of tools (e.g. fetch_website only).
 * Used by List Builder so Grok can browse real pages without Apollo/Tavily.
 */
export async function runMantleGrokScopedAgent(params: {
  system: string;
  user: string;
  tools: MantleOpenAiTool[];
  executeTool: (
    name: string,
    input: Record<string, unknown>
  ) => Promise<string>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
}): Promise<{ text: string; toolsUsed: string[]; model: string; iterations: number }> {
  const model = params.model || MANTLE_GROK_43;
  const maxIterations = Math.min(
    Math.max(params.maxIterations ?? 5, 1),
    8
  );
  const toolsUsed = new Set<string>();
  let usedModel = model;

  const messages: ChatMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  for (let i = 0; i < maxIterations; i++) {
    const result = await invokeMantleChat({
      model,
      messages,
      tools: params.tools.length ? params.tools : undefined,
      temperature: params.temperature ?? 0.2,
      maxTokens: params.maxTokens ?? 4096,
    });
    usedModel = result.model;
    const toolCalls = result.tool_calls || [];

    if (!toolCalls.length) {
      return {
        text: result.content || "",
        toolsUsed: Array.from(toolsUsed),
        model: usedModel,
        iterations: i + 1,
      };
    }

    messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const name = tc.function?.name || "";
      toolsUsed.add(name);
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = { query: tc.function.arguments || "" };
      }
      try {
        const out = await params.executeTool(name, input);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: out.slice(0, 12_000),
        });
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Error: ${err instanceof Error ? err.message : "failed"}`,
        });
      }
    }
  }

  // Force a final answer without tools after iteration cap
  const final = await invokeMantleChat({
    model,
    temperature: 0.1,
    maxTokens: params.maxTokens ?? 4096,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Stop using tools. Return your final answer now based on what you already fetched.",
      },
    ],
  });

  return {
    text: final.content || "",
    toolsUsed: Array.from(toolsUsed),
    model: final.model || usedModel,
    iterations: maxIterations + 1,
  };
}
