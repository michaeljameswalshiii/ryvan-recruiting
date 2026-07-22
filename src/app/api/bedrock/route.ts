/**
 * Bedrock AI API Route
 * Upgraded with Claude Sonnet 4.6 + Native MCP Tool Calling
 *
 * Features:
 * - Native MCP Tool Calling:
 *   - Model decides when and which tools to call
 *   - Anthropic tool_use format in API requests
 *   - Agent loop: plan → tool use → observe → reflect → answer
 * - Claude Sonnet 4.6 on Bedrock:
 *   - global.anthropic.claude-sonnet-4-6 (cross-region recommended)
 *   - Supports native tool definitions
 * - Strong TypeScript types for messages and tool results
 * - Structured logging (latency, tokens, cost)
 * - Better error handling with retries
 * - Tenant context from middleware headers
 * - Per-tenant rate limiting
 *
 * @serverOnly
 */

// Allow long agent loops (Sonnet + tools). Vercel Pro up to 300s; set 60 for safety.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, addRateLimitHeaders } from "@/lib/rate-limit";
import { logBedrockUsage } from "@/lib/aws/athena-bedrock";
import { SYSTEM_PROMPTS, getBasePrompt } from "@/lib/prompts/bedrock-system";
import { getClaudeAssistantPrompt } from "@/lib/prompts/claude-assistant";
import { getToolSchemas, executeTool, ToolContext, ToolResult, ToolParams } from "@/lib/ai/tools";
import { CRM_WRITE_TOOLS } from "@/lib/ai/tools/crm-write";
import {
  filterEnabledToolSchemas,
  isApolloToolEnabled,
  isTavilyToolEnabled,
} from "@/lib/ai/tool-flags";
import {
  getDecryptedAnthropicKey,
  getDecryptedGrokKey,
  getDecryptedOpenaiKey,
  getDecryptedGeminiKey,
  getAiCredentialsPublic,
} from "@/lib/db/repositories/ai-credentials-repository";
import {
  runAnthropicByokAgent,
  runAnthropicByokChat,
} from "@/lib/ai/providers/anthropic-byok";
import {
  GROK_DEFAULT_MODEL,
  runGrokByokAgent,
  runGrokByokChat,
} from "@/lib/ai/providers/grok-byok";
import {
  MANTLE_GROK_43,
  runMantleGrokAgent,
  runMantleGrokChat,
} from "@/lib/ai/providers/bedrock-mantle";
import {
  runOpenaiByokAgent,
  runOpenaiByokChat,
} from "@/lib/ai/providers/openai-byok";
import {
  runGeminiByokAgent,
  runGeminiByokChat,
} from "@/lib/ai/providers/gemini-byok";
import { getSession } from "@/lib/server-auth";

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Chat message from client
 */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
}

/** Platform Bedrock vs user BYOK (Anthropic / OpenAI / Gemini / Grok) */
export type AiProviderId =
  | "bedrock"
  | "anthropic"
  | "openai"
  | "gemini"
  | "grok";

/**
 * Request body
 */
interface BedrockRequest {
  messages: ChatMessage[];
  model?: string;
  useTools?: boolean;
  assistantMode?: boolean;
  /** Open-ended chat (General AI Usage) — Sonnet + tools + multi-turn history */
  generalMode?: boolean;
  /**
   * Optional page/route context from the floating assistant
   * (candidate id, job id, company id, path). Appended to system prompt.
   */
  pageContext?: string;
  /** 'bedrock' (platform) | BYOK: anthropic | openai | gemini | grok */
  provider?: AiProviderId;
  useSearch?: boolean;
}

function buildGeneralAiSystemPrompt(): string {
  // Apollo/Tavily lines only when re-enabled via AI_TOOLS_*_ENABLED
  const externalLines: string[] = [];
  if (isApolloToolEnabled()) {
    externalLines.push(
      "- apollo / apollo_company_search: external people & company search"
    );
  }
  externalLines.push(
    "- fetch_website: open and read a public company website/page by URL (use this when the user gives a website or asks you to examine a site — do NOT claim you cannot browse URLs)"
  );
  if (isTavilyToolEnabled()) {
    externalLines.push(
      "- tavily: optional web search (prefer fetch_website for a specific URL)"
    );
  }
  if (!isApolloToolEnabled() && !isTavilyToolEnabled()) {
    externalLines.push(
      "- External people/company databases (e.g. Apollo) and live web search are not available. Use internal_data for ATS records and fetch_website for a specific URL the user provides."
    );
  } else if (!isApolloToolEnabled()) {
    externalLines.push(
      "- Apollo people/company search is disabled. Do not claim Apollo access. Use internal_data and other available tools."
    );
  }

  return `You are a professional general-purpose AI assistant on AWS Bedrock with access to this recruiting ATS (Trio Recruiting).

You help with analysis, writing, research, document review, AND operating the CRM when the user asks.

READ tools:
- internal_data: list/get leads (candidates), clients (companies), jobs, pipeline
${externalLines.join("\n")}

FILE tools:
- generate_file: create a downloadable Word (.docx), Excel (.xlsx), CSV, Markdown, text, JSON, or HTML file. Use whenever the user wants a document, spreadsheet, export, or attachment. After success, tell them to use the Download button that appears under your message — do NOT say you cannot create files or attachments.

WRITE tools (CRM mutations — same data as the UI):
- create_candidate, update_candidate, update_candidate_stage → Candidates list (pipeline)
- create_contact → company contact on Contact Info (hiring managers, NOT candidates)
- create_company, update_company → Companies
- create_job, update_job
- link_candidate_to_job, update_job_candidate_stage

IMPORTANT entity rules:
- "Contact" / "hiring manager" / "add to Contact Info" / "contact at Company X" → use create_contact (needs company_id or company_name).
- "Candidate" / "talent" / "pipeline" / "applicant" → use create_candidate.
- create_candidate with a company name only stores a note; it does NOT put them on Contact Info.
- Never say someone is a company contact unless create_contact returned status "created".

CRITICAL confirmation rules for ALL write tools:
1. First call the tool WITHOUT confirmed (or confirmed:false). You will get status "needs_confirmation" and a preview.
2. Show the user a clear summary of what will change and ask them to confirm.
3. Only after the user explicitly agrees (yes / confirm / go ahead / do it / ok / sure), call the SAME tool again with the same fields AND confirmed:true.
4. NEVER claim data was saved until a tool returns status created/updated/linked/stage_updated in the tool result JSON.
5. If the user only says "yes" or "ok", you STILL must re-invoke the write tool with confirmed:true — do not answer from memory.
6. NEVER invent candidate_id, company_id, contact_id, or job_id — look them up with internal_data first.
7. Tenant isolation is automatic from the session; do not ask for tenant id.
8. After a successful create/update tool result, tell the user the record is saved and that lists refresh automatically.

Other rules:
- Maintain multi-turn context; honor revision requests
- Use tools when they improve the answer
- When building a company record from a website, call fetch_website with the URL first, then extract name, industry, location, description, and domain from the returned text
- Analyze file attachments carefully when present
- Be clear and professional; prefer actionable answers
- If a tool fails, say so and continue with what you know
- For downloadable docs: call generate_file with full content (not a stub). Prefer docx for letters/prep docs, xlsx/csv for tables/lists, md/txt for plain notes. Never claim file generation is unavailable.`;
}

/**
 * Tool result data from tool execution
 */
interface ToolResultData {
  candidates?: ApolloCandidate[];
  results?: TavilyResult[];
  [key: string]: unknown;
}

/**
 * Apollo candidate result
 */
interface ApolloCandidate {
  id: string;
  name: string;
  title?: string;
  organization?: string;
  linkedin_url?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
}

/**
 * Tavily search result
 */
interface TavilyResult {
  title: string;
  snippet: string;
  url?: string;
}

/**
 * Tool result summary for response
 */
interface ToolResultSummary {
  success: boolean;
  error?: string;
  count: number;
}

/**
 * Rate limit info for response
 */
interface RateLimitInfo {
  remaining: number;
  tenantId: string;
}

/**
 * Token usage info
 */
interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Cost estimate (USD)
 */
interface CostEstimate {
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

/**
 * Logging metadata
 */
interface RequestLogMetadata {
  query: string;
  tenantId: string | null;
  toolsUsed: string[];
  latencyMs: number;
  tokens?: TokenUsage;
  cost?: CostEstimate;
  error?: string;
}

// ============================================================================
// Constants - Dynamic Model Routing
// ============================================================================

/**
 * Model IDs for Anthropic Claude on AWS Bedrock
 * 
 * Routing Strategy:
 * - Haiku 4.5: Simple queries, summarization, fast lookups (fastest/cheapest)
 * - Sonnet 4.6: Most agentic work, targeted research, tool orchestration (default)
 * - Opus 4.7: Very complex multi-step planning, large context (most capable)
 */

// Model IDs must match AWS Bedrock foundation / inference profile IDs
// (verify with: aws bedrock list-inference-profiles --region us-east-1)

// Haiku 4.5 - Fast/cheap for simple queries
const MODEL_HAIKU = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

// Sonnet 4.6 - Default for most agentic work (cross-region global profile)
const MODEL_SONNET = "global.anthropic.claude-sonnet-4-6";

// Amazon Nova (platform Bedrock — Converse API)
const MODEL_NOVA_LITE = "us.amazon.nova-lite-v1:0";
const MODEL_NOVA_PRO = "us.amazon.nova-pro-v1:0";
const MODEL_NOVA_LITE_ON_DEMAND = "amazon.nova-lite-v1:0";
const MODEL_NOVA_PRO_ON_DEMAND = "amazon.nova-pro-v1:0";
const MODEL_NOVA_2_LITE = "amazon.nova-2-lite-v1:0";

// xAI Grok 4.3 on Amazon Bedrock Mantle (NOT Converse / InvokeModel)
// Endpoint: https://bedrock-mantle.{region}.api.aws/openai/v1
// Model ID: xai.grok-4.3
const MODEL_GROK_43 = MANTLE_GROK_43;
/** Direct xAI API id (BYOK provider path only — not Mantle) */
const MODEL_GROK_43_XAI_API = GROK_DEFAULT_MODEL || "grok-4.3";

// Fallbacks if primary inference profile is unavailable in the account/region
const MODEL_HAIKU_FALLBACK = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const MODEL_SONNET_FALLBACK = "us.anthropic.claude-sonnet-4-6";
const MODEL_HAIKU_LEGACY = "us.anthropic.claude-3-haiku-20240307-v1:0";

// Default model for tool/agent paths when no auto-route applies
const DEFAULT_MODEL = MODEL_SONNET;

/** Platform Bedrock Grok (xai.grok-*) or UI alias */
function isGrokModelId(modelId?: string): boolean {
  return /grok/i.test(modelId || "");
}

/** Strong / agentic tier for Most Efficient — Grok 4.3 on Bedrock, ahead of Sonnet */
function preferredStrongModel(): string {
  return MODEL_GROK_43;
}

function isNovaModel(modelId?: string): boolean {
  return /nova/i.test(modelId || "");
}

/** Ordered fallbacks when a model id is rejected by Bedrock */
function modelFallbackChain(primary: string): string[] {
  const chain = [primary];
  const id = primary.toLowerCase();
  if (id.includes("grok")) {
    // Mantle Grok has no Converse fallback chain of IDs — Sonnet is app-level fallback
    chain.push(MODEL_GROK_43, MODEL_SONNET, MODEL_SONNET_FALLBACK);
  } else if (id.includes("nova-lite") || id.includes("nova_lite") || id.includes("nova-2-lite")) {
    chain.push(
      MODEL_NOVA_LITE,
      MODEL_NOVA_LITE_ON_DEMAND,
      MODEL_NOVA_2_LITE,
      MODEL_HAIKU
    );
  } else if (id.includes("nova")) {
    chain.push(MODEL_NOVA_PRO, MODEL_NOVA_PRO_ON_DEMAND, MODEL_SONNET);
  } else if (id.includes("haiku")) {
    chain.push(MODEL_HAIKU, MODEL_HAIKU_FALLBACK, MODEL_HAIKU_LEGACY, MODEL_SONNET);
  } else if (id.includes("opus")) {
    // Opus removed — always fall through to Sonnet
    chain.push(MODEL_SONNET, MODEL_SONNET_FALLBACK, MODEL_HAIKU);
  } else {
    chain.push(MODEL_SONNET, MODEL_SONNET_FALLBACK, MODEL_HAIKU);
  }
  // de-dupe preserve order
  return [...new Set(chain)];
}

function isInvalidModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";
  return (
    name === "ValidationException" ||
    /model identifier is invalid|ValidationException|doesn't support|not authorized to use model|access denied.*model/i.test(
      message
    )
  );
}

// Anthropic API version for Bedrock
const ANTHROPIC_VERSION = "bedrock-2023-05-31";

// Model configuration
// NOTE: Use either temperature OR top_p, NOT both (Bedrock limitation)
const MODEL_CONFIG = {
  maxTokens: 4096,
  temperature: 0.7,
  // topP: 0.95,  // Removed - cannot use with temperature
  maxIterations: 5,
};

/**
 * Query complexity levels for dynamic routing
 */
type QueryComplexity = "simple" | "moderate" | "complex";

/**
 * Analyze query complexity to determine optimal model
 * 
 * @param query - User query string
 * @returns Complexity level
 */
function analyzeQueryComplexity(query: string): QueryComplexity {
  const q = query.toLowerCase();
  const wordCount = q.split(/\s+/).length;
  
  // Complex indicators: multi-step, planning, analysis, comparison, many criteria
  const complexKeywords = [
    "compare", "analysis", "analyze", "plan", "planning", "strategy", "strategic",
    "multiple", "and also", "as well as", "then", "after that", "finally",
    "pros and cons", "versus", "vs ", "benefits", "tradeoffs", "decision",
    "research", "investigate", "deep dive", "detailed", "comprehensive",
    "all companies", "all candidates", "every", "list of", "all the",
    "prioritize", "rank", "score", "evaluate", "assess"
  ];
  
  // Simple indicators: basic lookup, rewrite, short asks
  const simpleKeywords = [
    "what is", "who is", "find", "show", "get", "list",
    "email", "phone", "contact", "linkedin",
    "summarize", "summary", "quick", "just",
    "rewrite", "rephrase", "shorter", "longer", "fix grammar",
    "typo", "title", "subject line", "bullet", "bullets",
    "weather", "stock", "price", "today", "hello", "hi ",
  ];
  
  // Count keyword matches
  const complexMatches = complexKeywords.filter(kw => q.includes(kw)).length;
  const simpleMatches = simpleKeywords.filter(kw => q.includes(kw)).length;
  
  // Determine complexity
  if (complexMatches >= 2 || wordCount > 50) {
    return "complex";
  }
  
  // Short prompts: prefer simple/cheap unless clearly complex
  if (complexMatches === 0 && wordCount <= 12) {
    return "simple";
  }

  if (simpleMatches >= 1 && complexMatches === 0 && wordCount < 25) {
    return "simple";
  }
  
  // Default to moderate
  return "moderate";
}

/**
 * Resolve UI / API aliases to concrete Bedrock model IDs.
 * "auto" / "efficient" / "most-efficient" → undefined (Most Efficient ladder).
 */
function resolveRequestedModelId(requestedModel?: string): string | undefined {
  if (!requestedModel) return undefined;
  const m = requestedModel.trim().toLowerCase();
  if (
    m === "auto" ||
    m === "default" ||
    m === "efficient" ||
    m === "most-efficient" ||
    m === "most_efficient" ||
    m === "value"
  ) {
    return undefined;
  }
  if (m === "haiku") return MODEL_HAIKU;
  if (m === "sonnet") return MODEL_SONNET;
  // Opus removed from product surface — map legacy picks to Sonnet
  if (m === "opus") return MODEL_SONNET;
  if (m === "nova-lite" || m === "nova_lite" || m === "novalite")
    return MODEL_NOVA_LITE;
  if (m === "nova-pro" || m === "nova_pro" || m === "novapro" || m === "nova")
    return MODEL_NOVA_PRO;
  if (
    m === "grok" ||
    m === "grok-4.3" ||
    m === "grok4.3" ||
    m === "grok_4_3" ||
    m === "grok-4-3" ||
    m === "xai.grok-4.3" ||
    m === "us.xai.grok-4.3"
  ) {
    return MODEL_GROK_43; // Mantle model id
  }
  // Allow full Bedrock model ids
  if (
    m.includes("nova") ||
    m.includes("anthropic") ||
    m.includes("claude") ||
    m.includes("xai") ||
    m.includes("grok")
  ) {
    return requestedModel;
  }
  return undefined;
}

/** Recruiting / CRM / research intents that need Claude tool_use (Sonnet). */
function hasToolOrAgenticIntent(query: string): boolean {
  return /\b(search|find people|find companies|apollo|research|look up|linkedin|pipeline|candidates|leads|web search|latest news|tavily|website|browse|examine|http|https|create |add |update |move |link |save |job|company|client|contact|download|docx|xlsx|spreadsheet|word doc|export|attachment|generate (a |the )?file|write (a |the )?file)\b/i.test(
    query || ""
  );
}

/**
 * Most Efficient (default platform policy) — cheapest capable model per turn.
 *
 * Ladder (Opus removed entirely):
 * - Grok 4.3 on Bedrock (preferred over Sonnet): tools, CRM, files, long context, complex
 * - Haiku: moderate chat without tools
 * - Nova Lite: simple short chat (cheapest)
 *
 * Grok 4.3 uses Bedrock model id xai.grok-4.3 (same AWS credentials as Claude/Nova).
 */
function selectMostEfficientModel(
  query: string,
  options?: {
    historyChars?: number;
    messages?: Array<{ role: string; content?: string }>;
  }
): string {
  const q = query || "";
  const historyChars = options?.historyChars ?? 0;
  const msgs = options?.messages || [];
  const hasFileMarker = /---\s*Attached file:|---\s*End of /i.test(q);
  const longContent = q.length > 4000 || historyChars > 12000;
  const strong = preferredStrongModel();

  // Confirmations need a strong tool-capable model (Grok 4.3 preferred; not Haiku/Nova)
  if (
    isUserConfirmation(q) ||
    (historyHasPendingCrmConfirm(msgs) &&
      /yes|confirm|save|go ahead|do it|ok|sure/i.test(q))
  ) {
    console.log(`[Most Efficient] → ${strong} (CRM confirmation; Grok > Sonnet)`);
    return strong;
  }

  if (hasFileMarker || longContent || hasToolOrAgenticIntent(q)) {
    console.log(
      `[Most Efficient] → ${strong} (tools / files / long context; Grok > Sonnet/Opus)`
    );
    return strong;
  }

  const complexity = analyzeQueryComplexity(q);
  if (complexity === "simple") {
    console.log("[Most Efficient] → Nova Lite (simple chat)");
    return MODEL_NOVA_LITE;
  }

  if (complexity === "complex") {
    console.log(
      `[Most Efficient] → ${strong} (complex; Grok preferred over Sonnet/Opus)`
    );
    return strong;
  }

  // moderate short reasoning without tools
  console.log("[Most Efficient] → Haiku (moderate chat)");
  return MODEL_HAIKU;
}

/**
 * Select model: explicit UI pick wins; otherwise Most Efficient ladder.
 */
function selectModel(
  query: string,
  requestedModel?: string,
  options?: {
    historyChars?: number;
    messages?: Array<{ role: string; content?: string }>;
  }
): string {
  const resolved = resolveRequestedModelId(requestedModel);
  if (resolved) {
    console.log(`Using explicitly requested model: ${resolved}`);
    return resolved;
  }
  return selectMostEfficientModel(query, options);
}

/**
 * Friendly label for UI badges (not the full Bedrock model id).
 */
function friendlyModelLabel(modelId: string): string {
  const id = (modelId || "").toLowerCase();
  if (id.includes("haiku")) return "Claude Haiku";
  if (id.includes("opus")) return "Claude Opus";
  if (id.includes("sonnet")) return "Claude Sonnet";
  if (id.includes("nova-lite") || id.includes("nova_lite") || id.includes("nova-2-lite"))
    return "Amazon Nova Lite";
  if (id.includes("nova-pro") || id.includes("nova_pro")) return "Amazon Nova Pro";
  if (id.includes("nova-micro")) return "Amazon Nova Micro";
  if (id.includes("nova")) return "Amazon Nova";
  if (id.includes("grok-4.3") || id.includes("grok-4-3") || id.includes("xai.grok"))
    return "Grok 4.3";
  if (id.includes("grok")) return "Grok";
  if (id.includes("gpt-4o") || id.includes("gpt-4.1") || id.includes("o3") || id.includes("o4"))
    return "OpenAI GPT";
  if (id.includes("gpt")) return "OpenAI";
  if (id.includes("gemini")) return "Google Gemini";
  // strip provider prefixes like bedrock:us.anthropic...
  const tail = modelId.split(/[/:]/).pop() || modelId;
  return tail.length > 40 ? `${tail.slice(0, 37)}…` : tail;
}

/** User is confirming a pending CRM write (yes / save / go ahead) */
function isUserConfirmation(query: string): boolean {
  const q = (query || "").trim();
  if (!q || q.length > 80) return false;
  return /^(yes|y|yeah|yep|yup|ok|okay|sure|confirm|confirmed|go ahead|do it|please do|proceed|save( it)?|save this|looks good|lgtm|approved|ship it)([.!\s]|$)/i.test(
    q
  );
}

/** Prior assistant turn asked for confirmation / showed a write preview */
function historyHasPendingCrmConfirm(
  messages: Array<{ role: string; content?: string }>
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const c = String(m.content || "");
    if (
      /shall i (go ahead|save|create|add)|needs_confirmation|preview before i save|when they say yes|confirmed:\s*true|ask them to confirm|do you want me to (save|create|add)|ready to (save|create)/i.test(
        c
      )
    ) {
      return true;
    }
    // Only inspect the latest assistant turn
    break;
  }
  return false;
}

/**
 * General AI + floating assistant: same Most Efficient ladder as platform Auto.
 * Opus is never selected here.
 */
function selectModelForGeneralAI(
  query: string,
  options?: {
    historyChars?: number;
    messages?: Array<{ role: string; content?: string }>;
  }
): string {
  return selectMostEfficientModel(query, options);
}

/**
 * Estimate token count from text
 * Rough estimate: ~4 characters per token
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate cost for Claude Sonnet 4.6 on Bedrock (USD)
 * Pricing: ~$0.003/1K tokens input, ~$0.015/1K tokens output
 */
function estimateCost(promptTokens: number, completionTokens: number): CostEstimate {
  const promptCost = (promptTokens / 1000) * 0.003;
  const completionCost = (completionTokens / 1000) * 0.015;
  return {
    promptCost,
    completionCost,
    totalCost: promptCost + completionCost,
  };
}

/**
 * App URL for internal API calls
 */
function getAppUrl(request: NextRequest): string {
  return request.url ? new URL(request.url).origin : 
    process.env.NEXT_PUBLIC_APP_URL || 
    "http://localhost:3001";
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Get rate limit key - use tenant ID if available, else IP
 */
function getRateLimitKey(request: NextRequest, tenantId: string | null): string {
  if (tenantId) {
    return `bedrock:tenant:${tenantId}`;
  }
  const ip = request.headers.get("x-forwarded-for") || 
    request.headers.get("x-real-ip") || 
    "unknown";
  return `bedrock:ip:${ip.split(",")[0].trim()}`;
}

// ============================================================================
// MCP Agent Loop - Native Tool Calling
// ============================================================================

/**
 * Anthropic-style message format for Claude API
 */
interface ClaudeMessage {
  role: "system" | "user" | "assistant" | "tool_result";
  content: string | ClaudeContent[];
}

/**
 * Claude content block types
 */
type ClaudeContent = 
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

/**
 * Tool schema for Bedrock API
 */
interface BedrockTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/**
 * Get tool schemas in Anthropic format
 */
function getToolSchemasForBedrock(): BedrockTool[] {
  const writeTools: BedrockTool[] = CRM_WRITE_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema,
  }));

  const all: BedrockTool[] = [
    {
      name: "apollo",
      description: "Search for people/candidates using Apollo.io (emails, phones, LinkedIn, titles).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (job title, company, skills, industry)" },
          location: { type: "string", description: "Location filter (city, state)" },
          per_page: { type: "number", description: "Number of results (default 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "apollo_company_search",
      description: "Search for companies/organizations using Apollo.io (industry, size, website, location).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Company name, industry, or keyword" },
          location: { type: "string", description: "Location filter" },
          per_page: { type: "number", description: "Number of results (default 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "tavily",
      description: "Search the web for latest news, current events, research, or general information.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for web search" },
          max_results: { type: "number", description: "Maximum number of results (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: "fetch_website",
      description:
        "Fetch and read a public website by URL. Use when the user provides a company website or asks you to examine a page. Prefer this over saying you cannot open URLs.",
      input_schema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL or domain (e.g. https://acme.com or acme.com/about)",
          },
          query: {
            type: "string",
            description: "Optional alias for url",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "generate_file",
      description:
        "Create a downloadable file: docx, xlsx, csv, md, txt, json, or html. Use for documents, spreadsheets, exports, and attachments. App shows a Download button — never say you cannot create files.",
      input_schema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            description: "docx | xlsx | csv | md | txt | json | html",
          },
          file_name: {
            type: "string",
            description: "File name e.g. interview-prep.docx",
          },
          content: {
            type: "string",
            description:
              "Full file body. For xlsx, JSON {\"headers\":[...],\"rows\":[[...]]} is preferred.",
          },
          title: {
            type: "string",
            description: "Optional document title",
          },
        },
        required: ["format", "content"],
      },
    },
    {
      name: "internal_data",
      description:
        "Read ATS data: leads/candidates, clients/companies, jobs, pipeline. action list|get. Use before updates to find ids.",
      input_schema: {
        type: "object",
        properties: {
          data_type: {
            type: "string",
            description: "leads | candidates | clients | jobs | pipeline",
          },
          action: { type: "string", description: "list or get" },
          id: { type: "string", description: "Record id when action is get" },
        },
        required: ["data_type", "action"],
      },
    },
    ...writeTools,
  ];
  // Apollo/Tavily schemas stay defined above; omitted unless AI_TOOLS_*_ENABLED
  return filterEnabledToolSchemas(all);
}

/**
 * Invoke Amazon Nova (and other Converse-compatible models) via Bedrock Converse.
 * Nova does not use the Anthropic messages body format.
 */
async function invokeNovaConverse(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string = "",
  modelId: string = MODEL_NOVA_LITE
): Promise<{ text: string; modelId: string }> {
  const converseMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: [{ text: m.content || "" }],
    }));

  // Converse requires alternating roles and ending with user
  if (
    converseMessages.length === 0 ||
    converseMessages[converseMessages.length - 1].role !== "user"
  ) {
    converseMessages.push({
      role: "user",
      content: [{ text: "Continue." }],
    });
  }

  const candidates = modelFallbackChain(modelId);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      console.log(
        `[Nova] Converse ${candidate} with ${converseMessages.length} messages`
      );
      const command = new ConverseCommand({
        modelId: candidate,
        messages: converseMessages,
        system: systemPrompt
          ? [{ text: systemPrompt }]
          : undefined,
        inferenceConfig: {
          maxTokens: MODEL_CONFIG.maxTokens,
          temperature: MODEL_CONFIG.temperature,
        },
      });
      const response = await bedrockClient.send(command);
      const parts = response.output?.message?.content || [];
      const text = parts
        .map((p) => ("text" in p && p.text ? p.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      return {
        text: text || "No response",
        modelId: candidate,
      };
    } catch (err) {
      lastError = err;
      if (
        isInvalidModelError(err) &&
        candidate !== candidates[candidates.length - 1]
      ) {
        console.warn(
          `[Nova] Model ${candidate} rejected, trying next:`,
          err instanceof Error ? err.message : err
        );
        continue;
      }
      // Access denied / not enabled — try next candidate too
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /access|not authorized|isn't supported|ValidationException/i.test(msg) &&
        candidate !== candidates[candidates.length - 1]
      ) {
        console.warn(`[Nova] ${candidate} failed (${msg}), trying next`);
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Nova model candidates failed");
}

type ConverseMsg = {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
};

/**
 * Grok 4.3 on Amazon Bedrock via Converse API (toolConfig when tools provided).
 * Same AWS credentials as Claude/Nova — no separate xAI API key required.
 */
async function invokeGrokBedrockConverse(
  messages: ConverseMsg[],
  systemPrompt: string,
  modelId: string,
  tools: BedrockTool[] = []
): Promise<{
  text: string;
  modelId: string;
  stopReason?: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  rawAssistantContent: Array<Record<string, unknown>>;
}> {
  const candidates = modelFallbackChain(modelId);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      console.log(
        `[Grok Bedrock] Converse ${candidate} msgs=${messages.length} tools=${tools.length}`
      );
      const input: Record<string, unknown> = {
        modelId: candidate,
        messages,
        system: systemPrompt ? [{ text: systemPrompt }] : undefined,
        inferenceConfig: {
          maxTokens: MODEL_CONFIG.maxTokens,
          temperature: MODEL_CONFIG.temperature,
        },
      };
      if (tools.length > 0) {
        input.toolConfig = {
          tools: tools.map((t) => ({
            toolSpec: {
              name: t.name,
              description: t.description,
              inputSchema: { json: t.input_schema },
            },
          })),
        };
      }
      const command = new ConverseCommand(input as any);
      const response = await bedrockClient.send(command);
      const parts = (response.output?.message?.content || []) as Array<
        Record<string, unknown>
      >;
      const text = parts
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      const toolUses: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];
      for (const p of parts) {
        const tu = p.toolUse as
          | { toolUseId?: string; name?: string; input?: Record<string, unknown> }
          | undefined;
        if (tu?.name && tu.toolUseId) {
          toolUses.push({
            id: tu.toolUseId,
            name: tu.name,
            input: (tu.input || {}) as Record<string, unknown>,
          });
        }
      }
      return {
        text: text || (toolUses.length ? "" : "No response"),
        modelId: candidate,
        stopReason: response.stopReason,
        toolUses,
        rawAssistantContent: parts,
      };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        candidate !== candidates[candidates.length - 1] &&
        (isInvalidModelError(err) ||
          /access|not authorized|isn't supported|ValidationException|ResourceNotFound/i.test(
            msg
          ))
      ) {
        console.warn(`[Grok Bedrock] ${candidate} failed, trying next:`, msg);
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Grok Bedrock model candidates failed");
}

/**
 * Agent loop for Grok 4.3 on Bedrock Converse (tools via toolConfig).
 */
async function runGrokBedrockAgent(
  query: string,
  toolContext: ToolContext,
  options?: {
    history?: ChatMessage[];
    systemPrompt?: string;
    modelId?: string;
  }
): Promise<{
  text: string;
  toolsUsed: string[];
  modelId: string;
  crmMutated: boolean;
  generatedFiles: NonNullable<ToolContext["generatedFiles"]>;
}> {
  const systemPrompt =
    options?.systemPrompt ||
    `You are a recruiting AI assistant on Grok 4.3 via Amazon Bedrock.
Use tools when they improve the answer. Be concise and actionable.`;
  const tools = getToolSchemasForBedrock();
  const toolsUsed = new Set<string>();
  let crmMutated = false;
  let modelId = options?.modelId || MODEL_GROK_43;
  if (!toolContext.generatedFiles) toolContext.generatedFiles = [];

  const prior = (options?.history || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-20);

  let converseMessages: ConverseMsg[] = [
    ...prior.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: [{ text: m.content }],
    })),
    { role: "user", content: [{ text: query }] },
  ];

  for (let i = 0; i < MODEL_CONFIG.maxIterations; i++) {
    const result = await invokeGrokBedrockConverse(
      converseMessages,
      systemPrompt,
      modelId,
      tools
    );
    modelId = result.modelId;

    if (!result.toolUses.length) {
      return {
        text: result.text || "No response",
        toolsUsed: Array.from(toolsUsed),
        modelId,
        crmMutated,
        generatedFiles: toolContext.generatedFiles || [],
      };
    }

    // Append assistant turn with tool uses
    converseMessages.push({
      role: "assistant",
      content: result.rawAssistantContent.length
        ? result.rawAssistantContent
        : result.toolUses.map((tu) => ({
            toolUse: {
              toolUseId: tu.id,
              name: tu.name,
              input: tu.input,
            },
          })),
    });

    const toolResultBlocks: Array<Record<string, unknown>> = [];
    for (const tu of result.toolUses) {
      toolsUsed.add(tu.name);
      const out = await executeToolByName(tu.name, tu.input, toolContext);
      if (
        /status":\s*"(created|updated|linked|stage_updated)"/.test(out) ||
        /"status":"(created|updated|linked|stage_updated)"/.test(out)
      ) {
        crmMutated = true;
      }
      toolResultBlocks.push({
        toolResult: {
          toolUseId: tu.id,
          content: [{ text: out }],
        },
      });
    }
    converseMessages.push({
      role: "user",
      content: toolResultBlocks,
    });
  }

  return {
    text: "Maximum tool iterations reached. Please refine your query.",
    toolsUsed: Array.from(toolsUsed),
    modelId,
    crmMutated,
    generatedFiles: toolContext.generatedFiles || [],
  };
}

/**
 * Invoke Claude model with optional tools and system prompt
 * 
 * @param messages - Conversation messages
 * @param tools - Available tools for the model
 * @param systemPrompt - System prompt (placed in correct top-level field)
 */
async function invokeClaude(
  messages: ClaudeMessage[],
  tools: BedrockTool[] = [],
  systemPrompt: string = "",
  modelId: string = DEFAULT_MODEL
): Promise<{
  content: ClaudeContent[];
  stop_reason?: string;
  /** Actual model id that succeeded (may differ after fallback) */
  modelId: string;
}> {
  // Anthropic Messages API: only user/assistant roles in messages array
  const safeMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    anthropic_version: ANTHROPIC_VERSION,
    max_tokens: MODEL_CONFIG.maxTokens,
    temperature: MODEL_CONFIG.temperature,
    messages: safeMessages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: "auto" };
  }

  const candidates = modelFallbackChain(modelId);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      console.log(
        `[MCP] Invoking ${candidate} with ${safeMessages.length} messages, ${tools.length} tools`
      );

      const command = new InvokeModelCommand({
        modelId: candidate,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      });

      const response = await bedrockClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));

      const usage = result.usage;
      console.log(
        `[MCP] Claude response (${candidate}) - stop_reason: ${result.stop_reason} | tokens: ${usage?.input_tokens}/${usage?.output_tokens}`
      );

      return {
        content: result.content || [],
        stop_reason: result.stop_reason,
        modelId: candidate,
      };
    } catch (err) {
      lastError = err;
      if (isInvalidModelError(err) && candidate !== candidates[candidates.length - 1]) {
        console.warn(
          `[MCP] Model ${candidate} rejected, trying next fallback:`,
          err instanceof Error ? err.message : err
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Bedrock model candidates failed");
}

/**
 * Execute a tool by name with parameters
 */
async function executeToolByName(
  toolName: string,
  toolInput: Record<string, unknown> | ToolParams,
  toolContext: ToolContext
): Promise<string> {
  const query = toolInput.query as string || "";
  
  if (toolName === "apollo") {
    const result = await executeTool("apollo", { query, per_page: toolInput.per_page || 10 }, toolContext);
    if (result.success && result.data) {
      const data = result.data as { candidates?: Array<{ name: string; email?: string; phone?: string; linkedin_url?: string; title?: string; organization?: string }> };
      if (data.candidates?.length) {
        return data.candidates.slice(0, 10).map(p => 
          `${p.name} - ${p.title || ""} at ${p.organization || ""}\nEmail: ${p.email || "N/A"}\nPhone: ${p.phone || "N/A"}\nLinkedIn: ${p.linkedin_url || "N/A"}`
        ).join("\n\n");
      }
      return "No candidates found";
    }
    return `Error: ${result.error || "Unknown error"}`;
  }
  
  if (toolName === "tavily") {
    const result = await executeTool("tavily", { query, max_results: toolInput.max_results || 5 }, toolContext);
    if (result.success && result.data) {
      const data = result.data as { results?: Array<{ title: string; snippet: string }> };
      if (data.results?.length) {
        return data.results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}`).join("\n\n");
      }
      return "No results found";
    }
    return `Error: ${result.error || "Unknown error"}`;
  }

  if (toolName === "fetch_website") {
    const url =
      (toolInput.url as string) ||
      (toolInput.query as string) ||
      query ||
      "";
    const result = await executeTool(
      "fetch_website",
      { query: url, url } as ToolParams,
      toolContext
    );
    if (result.success && result.data) {
      const data = result.data as {
        url?: string;
        finalUrl?: string;
        title?: string;
        text?: string;
        truncated?: boolean;
      };
      const lines = [
        `URL: ${data.finalUrl || data.url || url}`,
        data.title ? `Title: ${data.title}` : null,
        data.truncated ? "(content truncated for length)" : null,
        "",
        data.text || "",
      ].filter((x) => x !== null);
      return lines.join("\n");
    }
    return `Error: ${result.error || "Failed to fetch website"}`;
  }

  if (toolName === "generate_file") {
    const result = await executeTool(
      "generate_file",
      {
        query: String(toolInput.content || toolInput.query || ""),
        format: toolInput.format,
        file_name: toolInput.file_name || toolInput.fileName,
        content: toolInput.content ?? toolInput.body ?? toolInput.text,
        title: toolInput.title,
      } as ToolParams,
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
      // Side-channel for UI downloads (never send base64 to the LLM)
      if (data.contentBase64 && data.fileName) {
        if (!toolContext.generatedFiles) toolContext.generatedFiles = [];
        toolContext.generatedFiles.push({
          fileName: String(data.fileName),
          mimeType: String(data.mimeType || "application/octet-stream"),
          contentBase64: String(data.contentBase64),
          sizeBytes: Number(data.sizeBytes) || 0,
          format: String(data.format || ""),
        });
      }
      return JSON.stringify({
        status: data.status || "generated",
        fileName: data.fileName,
        format: data.format,
        sizeBytes: data.sizeBytes,
        mimeType: data.mimeType,
        message:
          data.message ||
          `File ready: ${data.fileName}. The user will see a Download button in the app UI.`,
      });
    }
    return `Error: ${result.error || "Failed to generate file"}`;
  }

  if (toolName === "internal_data") {
    const result = await executeTool(
      "internal_data",
      {
        data_type: toolInput.data_type || "leads",
        action: toolInput.action || "list",
        id: toolInput.id,
      } as ToolParams,
      toolContext
    );
    if (result.success && result.data !== undefined) {
      const raw = JSON.stringify(result.data);
      // Cap payload size for model context
      return raw.length > 40000 ? raw.slice(0, 40000) + "\n…[truncated]" : raw;
    }
    return `Error: ${result.error || "Unknown error"}`;
  }

  // CRM write tools (create/update candidate, company, job, stages, link)
  if (CRM_WRITE_TOOLS.some((t) => t.name === toolName)) {
    const result = await executeTool(
      toolName,
      toolInput as ToolParams,
      toolContext
    );
    if (result.success && result.data !== undefined) {
      return JSON.stringify(result.data);
    }
    return `Error: ${result.error || "Write tool failed"}`;
  }

  if (toolName === "apollo_company_search" || toolName === "apollo_company") {
    const result = await executeTool(
      "apollo_company_search",
      { query, per_page: toolInput.per_page || 10, location: toolInput.location } as ToolParams,
      toolContext
    );
    if (result.success && result.data) {
      const data = result.data as {
        companies?: Array<{ name?: string; website?: string; industry?: string; employees?: string }>;
      };
      if (data.companies?.length) {
        return data.companies
          .slice(0, 10)
          .map(
            (c) =>
              `${c.name || "Company"} — ${c.industry || "n/a"} | ${c.website || "n/a"} | size: ${c.employees || "n/a"}`
          )
          .join("\n");
      }
      return "No companies found";
    }
    return `Error: ${result.error || "Unknown error"}`;
  }

  // Fallback: registry execute for any registered tool
  const fallback = await executeTool(
    toolName,
    { query, ...toolInput } as ToolParams,
    toolContext
  );
  if (fallback.success && fallback.data !== undefined) {
    const raw = typeof fallback.data === "string" ? fallback.data : JSON.stringify(fallback.data);
    return raw.length > 40000 ? raw.slice(0, 40000) + "\n…[truncated]" : raw;
  }
  return `Tool not found or failed: ${toolName}${fallback.error ? ` — ${fallback.error}` : ""}`;
}

/**
 * Execute a single tool and format result for Claude
 */
async function executeSingleTool(
  toolUse: ClaudeContent & { type: "tool_use" },
  toolContext: ToolContext
): Promise<{ tool_use_id: string; content: string }> {
  try {
    console.log(`[MCP Tool] Executing ${toolUse.name} with input:`, toolUse.input);
    const result = await executeToolByName(toolUse.name, toolUse.input, toolContext);
    console.log(`[MCP Tool] ${toolUse.name} completed`);
    return { tool_use_id: toolUse.id, content: result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Tool execution failed";
    console.error(`[MCP Tool Error] ${toolUse.name}:`, errorMsg);
    return { tool_use_id: toolUse.id, content: `Error: ${errorMsg}` };
  }
}

/**
 * Run MCP Agent Loop - Model decides when to use tools
 * Supports multi-turn history so revisions work in the same chat.
 */
async function runMCPAgent(
  query: string,
  toolContext: ToolContext,
  options?: {
    history?: ChatMessage[];
    systemPrompt?: string;
    modelId?: string;
  }
): Promise<{
  text: string;
  toolsUsed: string[];
  modelId: string;
  crmMutated: boolean;
  generatedFiles: NonNullable<ToolContext["generatedFiles"]>;
}> {
  const pendingConfirm = historyHasPendingCrmConfirm(options?.history || []);
  const confirming = isUserConfirmation(query) || (
    pendingConfirm && /yes|confirm|save|go ahead|do it|ok|sure|proceed/i.test(query)
  );

  let systemPrompt =
    options?.systemPrompt ||
    `You are an MCP (Multi-step Cognitive Processor) agent powered by Claude on AWS Bedrock.
Specialize in talent sourcing, recruiting, and CRM operations for Trio Recruiting.
Use only the tools provided in this request (internal ATS data, CRM writes, website fetch, files).
Think step-by-step: Plan → Use tools when needed → Observe results → Reflect → Final Answer.
Only use tools when they genuinely help. Be concise and actionable.`;

  if (confirming) {
    systemPrompt += `

CRITICAL — USER CONFIRMATION TURN:
The user is confirming a pending CRM action (create_contact, create_company, create_candidate, create_job, update_*, link_*, etc.).
You MUST call that write tool again now with confirmed:true and the same fields from your last preview.
Do NOT reply that something was saved unless the tool result JSON includes status "created", "updated", "linked", or "stage_updated".
If you are missing company_id or other ids, call internal_data first, then the write tool with confirmed:true.`;
  }

  const tools = getToolSchemasForBedrock();
  const toolsUsed = new Set<string>();
  let crmMutated = false;
  let modelId = options?.modelId || DEFAULT_MODEL;
  if (!toolContext.generatedFiles) toolContext.generatedFiles = [];

  // Prior turns (user/assistant text only), then current user query
  const prior = (options?.history || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-20)
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));

  let messages: ClaudeMessage[] = [
    ...prior,
    { role: "user", content: query },
  ];

  const MAX_ITERATIONS = 5;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    console.log(`[MCP] Iteration ${iteration + 1}/${MAX_ITERATIONS} (history=${prior.length})`);

    const result = await invokeClaude(messages, tools, systemPrompt, modelId);
    // Stick to the model that actually worked after any fallback
    modelId = result.modelId;
    const content = result.content;

    const toolUses = content.filter(
      (c): c is ClaudeContent & { type: "tool_use" } =>
        typeof c === "object" && c.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const textBlock = content.find(
        (c): c is ClaudeContent & { type: "text" } =>
          typeof c === "object" && c.type === "text"
      );
      let text = textBlock?.text || "No response";

      // Confirmation turn with no tools: force one more iteration to actually write
      if (confirming && !crmMutated && iteration < MAX_ITERATIONS - 1) {
        console.log(
          "[MCP] Confirmation without tools — nudging model to call write tool"
        );
        messages.push({ role: "assistant", content });
        messages.push({
          role: "user",
          content:
            "SYSTEM: You did not call a write tool. The user already confirmed. " +
            "Immediately call create_contact / create_company / create_candidate / create_job " +
            "(whichever applies) with the same fields as your last preview AND confirmed:true. " +
            "Do not claim success until the tool returns status created/updated.",
        });
        iteration++;
        continue;
      }

      // Guard: still no mutation — strip fake success claims
      if (
        confirming &&
        !crmMutated &&
        /saved|created successfully|contact created|company created|i('ve| have) (saved|created|added)/i.test(
          text
        )
      ) {
        text =
          "I wasn't able to complete the save via the CRM tool in this turn. " +
          "Please resend something like: “Add Mike Walsh as a contact for Chick-fil-A — confirmed” " +
          "and I will call create_contact with confirmed:true.";
      }

      console.log(`[MCP] Final response: ${text.substring(0, 100)}...`);
      return {
        text,
        toolsUsed: Array.from(toolsUsed),
        modelId,
        crmMutated,
        generatedFiles: toolContext.generatedFiles || [],
      };
    }

    console.log(`[MCP] Executing ${toolUses.length} tool(s) in parallel...`);
    for (const tu of toolUses) {
      toolsUsed.add(tu.name);
    }
    const executions = toolUses.map((tool) => executeSingleTool(tool, toolContext));
    const toolResults = await Promise.all(executions);

    for (const r of toolResults) {
      if (
        /"status"\s*:\s*"(created|updated|linked|stage_updated)"/.test(
          r.content || ""
        )
      ) {
        crmMutated = true;
      }
    }

    const formattedToolResults = toolResults.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
    })) as ClaudeContent[];

    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: formattedToolResults });

    iteration++;
  }

  console.log(`[MCP] Max iterations (${MAX_ITERATIONS}) reached`);
  return {
    text: "Maximum iterations reached. Please refine your query.",
    toolsUsed: Array.from(toolsUsed),
    modelId,
    crmMutated,
    generatedFiles: toolContext.generatedFiles || [],
  };
}

// ============================================================================
// Message Building
// ============================================================================

/**
 * Filter and format conversation messages
 */
function buildConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role !== "system" && m.id !== "welcome")
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    }));
}

/**
 * Add tool results as user messages
 */
function addToolResultsToMessages(
  messages: ChatMessage[],
  toolResults: Record<string, ToolResult>
): ChatMessage[] {
  const newMessages = [...messages];
  
  // Add Apollo results
  const apolloResult = toolResults.apollo;
  if (apolloResult?.success) {
    const data = apolloResult.data as ToolResultData;
    const candidates = data.candidates;
    if (candidates?.length) {
      const formatted = candidates.slice(0, 10).map((p) => 
        `${p.name} - ${p.title} at ${p.organization}\nEmail: ${p.email}\nPhone: ${p.phone}\nLinkedIn: ${p.linkedin_url}`
      ).join("\n\n");
      
      newMessages.push({
        role: "user",
        content: `Candidate Results:\n${formatted}`
      });
    }
  }
  
  // Add Tavily results
  const tavilyResult = toolResults.tavily;
  if (tavilyResult?.success) {
    const data = tavilyResult.data as ToolResultData;
    const results = data.results;
    if (results?.length) {
      const formatted = results.map((r, i) => 
        `${i + 1}. ${r.title}\n${r.snippet}`
      ).join("\n\n");
      
      newMessages.push({
        role: "user",
        content: `Search Results:\n${formatted}`
      });
    }
  }
  
  return newMessages;
}

/**
 * Build system prompt with tool context
 */
function buildSystemPrompt(toolResults: Record<string, ToolResult>): string {
  let prompt = SYSTEM_PROMPTS.base + "\n\n";
  
  // Add Apollo availability status
  const apolloResult = toolResults.apollo;
  if (apolloResult) {
    if (apolloResult.success) {
      prompt += SYSTEM_PROMPTS.apolloAvailable + "\n\n";
    } else {
      prompt += SYSTEM_PROMPTS.apolloUnavailable + "\n";
      prompt += `Error: ${apolloResult.error}\n\n`;
    }
  }
  
  prompt += SYSTEM_PROMPTS.override;
  
  return prompt;
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log request with structured metadata
 */
function logRequest(metadata: RequestLogMetadata): void {
  const { query, tenantId, toolsUsed, latencyMs, tokens, cost, error } = metadata;
  
  if (error) {
    console.error(JSON.stringify({
      event: "bedrock-request-failed",
      query: query.substring(0, 100),
      tenantId: tenantId || "anonymous",
      toolsUsed,
      latencyMs,
      error,
    }));
  } else {
    const logData: Record<string, unknown> = {
      event: "bedrock-request",
      query: query.substring(0, 100),
      tenantId: tenantId || "anonymous",
      toolsUsed,
      latencyMs,
    };
    
    // Add token usage if available
    if (tokens) {
      logData.tokens = tokens;
    }
    
    // Add cost estimate if available
    if (cost) {
      logData.cost = cost;
    }
    
    console.log(JSON.stringify(logData));
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error categories for better debugging
 */
type BedrockErrorCategory = 
  | "credentials" 
  | "model_access" 
  | "rate_limit" 
  | "validation" 
  | "timeout"
  | "network"
  | "unknown";

/**
 * Categorize error and determine handling
 */
function categorizeError(err: unknown): BedrockErrorCategory {
  const message = err instanceof Error ? err.message : String(err);
  const errorName = err instanceof Error ? err.name : "Unknown";
  
  // Credentials issues
  if (message.includes("AccessDeniedException") || 
      message.includes("Unauthorized") || 
      message.includes("access denied") ||
      message.includes("InvalidSignatureException") ||
      message.includes("SignatureDoesNotMatch") ||
      errorName === "CredentialsProviderError") {
    return "credentials";
  }
  
  // Model access issues
  if (message.includes("ModelNotSupportedException") || 
      message.includes("ValidationException") && message.includes("model")) {
    return "model_access";
  }
  
  // Rate limit issues
  if (message.includes("ThrottlingException") || 
      message.includes("Rate limit") ||
      message.includes("Throttling")) {
    return "rate_limit";
  }
  
  // Validation issues
  if (message.includes("ValidationException")) {
    return "validation";
  }
  
  // Timeout issues
  if (message.includes("AbortError") || 
      message.includes("timeout") ||
      message.includes("timed out")) {
    return "timeout";
  }
  
  // Network issues
  if (message.includes("ENOTFOUND") || 
      message.includes("ECONNREFUSED") ||
      message.includes("NetworkError") ||
      message.includes("Socket closed")) {
    return "network";
  }
  
  return "unknown";
}

/**
 * Get suggestion for error category
 */
function getSuggestionForCategory(category: BedrockErrorCategory): string {
  switch (category) {
    case "credentials":
      return "Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel env vars. Make sure credentials have Bedrock invoke permissions.";
    case "model_access":
      return "Request access to the model in AWS Bedrock Console > Model access. Make sure the model is available in your region.";
    case "rate_limit":
      return "Wait a few seconds before retrying. Consider reducing request frequency.";
    case "validation":
      return "Check request body format and try again with valid JSON.";
    case "timeout":
      return "The request took too long. Try again - the system will use faster models.";
    case "network":
      return "Network issue detected. Check AWS_REGION and try again.";
    default:
      return "Check AWS credentials and model access in AWS Bedrock Console";
  }
}

/**
 * Handle Bedrock invocation errors
 */
function handleBedrockError(err: unknown): { error: string; status: number; suggestion?: string; category?: BedrockErrorCategory } {
  const message = err instanceof Error ? err.message : "Unknown error";
  const errorName = err instanceof Error ? err.name : "Unknown";
  const errorCode = (err as any).code;
  const metadata = (err as any).$metadata;
  
  // Categorize the error
  const category = categorizeError(err);
  const suggestion = getSuggestionForCategory(category);
  
  // Log full error details
  console.error("=== BEDROCK FULL ERROR ===");
  console.error("Category:", category);
  console.error("Message:", message);
  console.error("Name:", errorName);
  console.error("Code:", errorCode);
  console.error("$metadata:", metadata);
  
  // Check for specific error types and return appropriate error message
  if (category === "rate_limit") {
    return { error: "Rate limit exceeded. Please try again.", status: 429, suggestion, category };
  }
  
  if (category === "credentials") {
    return { 
      error: "Unauthorized - Invalid AWS credentials", 
      status: 403,
      suggestion: "Make sure AWS credentials have Bedrock invoke permissions in IAM"
    };
  }
  
  if (category === "validation") {
    return { error: "Invalid request format.", status: 400, suggestion, category };
  }
  
  if (category === "timeout") {
    return { error: "Request timed out. Please try again.", status: 504, suggestion, category };
  }
  
  // For unknown errors, return the actual error message for better debugging
  return { 
    error: `Bedrock error: ${message}`, 
    status: 500,
    suggestion,
    category
  };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let tenantId: string | null = null;
  let lastUserQuery = "";
  
try {
    // ============================================================================
    // REQUEST VALIDATION (provider-aware)
    // ============================================================================
    
    // Parse request body
    let body: BedrockRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    
    const {
      messages,
      model: requestedModel,
      useTools = true,
      assistantMode = false,
      generalMode = false,
      provider: requestedProvider,
      pageContext: rawPageContext,
    } = body;

    const pageContext =
      typeof rawPageContext === "string" && rawPageContext.trim()
        ? rawPageContext.trim().slice(0, 4000)
        : "";

    const generalSystemPrompt = pageContext
      ? `${buildGeneralAiSystemPrompt()}

CURRENT UI CONTEXT (user is viewing this in the ATS — use these IDs with tools when relevant):
${pageContext}`
      : buildGeneralAiSystemPrompt();
    
// Validate messages exist
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required and cannot be empty" },
        { status: 400 }
      );
    }

    // ============================================================================
    // Tenant / user context (headers first, then session cookie)
    // ============================================================================
    tenantId = request.headers.get("x-tenant-id");
    let userId = request.headers.get("x-user-id");
    if (!userId || !tenantId) {
      try {
        const session = await getSession();
        if (session) {
          userId = userId || session.userId || null;
          tenantId = tenantId || session.tenantId || null;
        }
      } catch {
        /* ignore */
      }
    }
    console.log("Tenant ID:", tenantId || "none provided");
    console.log("User ID:", userId || "none");

    // Resolve provider: explicit request > user preference > bedrock
    let provider: AiProviderId = "bedrock";
    const validProviders: AiProviderId[] = [
      "bedrock",
      "anthropic",
      "openai",
      "gemini",
      "grok",
    ];
    if (
      requestedProvider &&
      validProviders.includes(requestedProvider as AiProviderId)
    ) {
      provider = requestedProvider as AiProviderId;
    } else if (userId) {
      try {
        const prefs = await getAiCredentialsPublic(userId);
        if (prefs.preferredProvider === "anthropic" && prefs.hasAnthropicKey) {
          provider = "anthropic";
        } else if (prefs.preferredProvider === "openai" && prefs.hasOpenaiKey) {
          provider = "openai";
        } else if (prefs.preferredProvider === "gemini" && prefs.hasGeminiKey) {
          provider = "gemini";
        } else if (prefs.preferredProvider === "grok" && prefs.hasGrokKey) {
          provider = "grok";
        }
      } catch {
        /* keep bedrock */
      }
    }
    console.log("AI provider:", provider);

    // ============================================================================
    // Dynamic Model Routing (MCP-Style) — Bedrock only
    // ============================================================================
    const userMessage = messages
      .filter((m) => m.role === "user")
      .slice(-1)[0];

    lastUserQuery = userMessage?.content || "";

    // General AI Usage always uses platform Bedrock (auto-routed model)
    if (generalMode) {
      provider = "bedrock";
    }

    const historyChars = messages.reduce(
      (n, m) => n + (typeof m.content === "string" ? m.content.length : 0),
      0
    );

    // Explicit model pick (UI) wins over Most Efficient auto-route for platform Bedrock
    const explicitBedrockModel = resolveRequestedModelId(requestedModel);
    const efficientOpts = { historyChars, messages };

    let selectedModel =
      provider === "anthropic"
        ? process.env.ANTHROPIC_BYOK_MODEL || "claude-sonnet-4-20250514"
        : provider === "openai"
          ? process.env.OPENAI_BYOK_MODEL || "gpt-4o"
          : provider === "gemini"
            ? process.env.GEMINI_BYOK_MODEL || "gemini-2.0-flash"
            : provider === "grok"
              ? MODEL_GROK_43_XAI_API // direct xAI API model id for BYOK only
              : explicitBedrockModel
                ? explicitBedrockModel
                : generalMode
                  ? selectModelForGeneralAI(lastUserQuery, efficientOpts)
                  : selectModel(lastUserQuery, requestedModel, efficientOpts);

    // Platform Grok uses Bedrock id xai.grok-4.3 (not the xAI API)
    if (
      provider === "bedrock" &&
      isGrokModelId(selectedModel) &&
      !String(selectedModel).includes("xai.")
    ) {
      selectedModel = MODEL_GROK_43;
    }

    let modelLabel = friendlyModelLabel(selectedModel);

    console.log("=== MODEL SELECTION ===");
    console.log("Provider:", provider);
    console.log("Most Efficient auto-route:", !explicitBedrockModel && provider === "bedrock");
    console.log("General AI mode:", generalMode);
    console.log("Requested model:", requestedModel || "none (Most Efficient)");
    console.log("Selected model:", selectedModel, `(${modelLabel})`);
    console.log(
      "Platform Grok on Bedrock:",
      provider === "bedrock" && isGrokModelId(selectedModel)
    );
    console.log("Query preview:", lastUserQuery.substring(0, 50));

    // Bedrock path needs AWS config (Claude, Nova, Grok 4.3 on Bedrock)
    if (provider === "bedrock") {
      const awsRegion = process.env.AWS_REGION;
      if (!awsRegion) {
        return NextResponse.json(
          { error: "Server configuration error: AWS_REGION not set" },
          { status: 500 }
        );
      }
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.warn("WARNING: AWS credentials may not be configured properly");
      }
    }

    // ============================================================================
    // Rate Limiting
    // ============================================================================
    const rateLimitKey = getRateLimitKey(request, tenantId);
    const rateLimitResult = checkRateLimit(rateLimitKey);
    
    if (!rateLimitResult.allowed) {
      return addRateLimitHeaders(
        NextResponse.json(
          { error: "Rate limit exceeded. Please wait before trying again." },
          { status: 429 }
        ),
        rateLimitResult
      );
    }

// Get request URL for internal API calls
    const appUrl = getAppUrl(request);

    // ============================================================================
    // Provider execution
    // ============================================================================
    let completion = "";
    let toolsUsed: string[] = [];
    let usedModel = selectedModel;
    let crmMutated = false;
    let generatedFiles: NonNullable<ToolContext["generatedFiles"]> = [];

    // ---------- BYOK Anthropic ----------
    if (provider === "anthropic") {
      if (!userId) {
        return NextResponse.json(
          {
            error: "Sign in required to use your Anthropic API key",
            suggestion: "Log in, then save your key under Settings → AI Providers",
          },
          { status: 401 }
        );
      }

      const apiKey = await getDecryptedAnthropicKey(userId);
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "No Anthropic API key saved",
            suggestion:
              "Add your key in Settings → AI Providers, or switch to Platform (Bedrock).",
          },
          { status: 400 }
        );
      }

      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
      };

      const systemPrompt =
        SYSTEM_PROMPTS.base + "\n\n" + (SYSTEM_PROMPTS.override || "");

      if (assistantMode || !useTools) {
        console.log("[BYOK] Anthropic chat (no tools)...");
        const conversation = buildConversationMessages(messages);
        const result = await runAnthropicByokChat({
          apiKey,
          model: usedModel,
          systemPrompt,
          messages: conversation.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        });
        completion = result.text;
        usedModel = result.model;
        toolsUsed = [];
      } else {
        console.log("[BYOK] Anthropic agent with tools...");
        const result = await runAnthropicByokAgent({
          apiKey,
          query: lastUserQuery,
          toolContext,
          systemPrompt,
          model: usedModel,
          useTools: true,
        });
        completion = result.text;
        toolsUsed = result.toolsUsed.length ? result.toolsUsed : ["apollo", "tavily"];
        usedModel = result.model;
      }
    }
    // ---------- BYOK Grok via direct xAI API (optional; platform uses Bedrock) ----------
    else if (provider === "grok") {
      if (!userId) {
        return NextResponse.json(
          {
            error: "Sign in required to use your Grok API key",
            suggestion: "Log in, then save your key under Settings → AI Providers",
          },
          { status: 401 }
        );
      }
      const apiKey = await getDecryptedGrokKey(userId);
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "No Grok/xAI API key saved",
            suggestion:
              "Add your key in Settings → AI Providers, or use Platform Grok 4.3 on Bedrock.",
          },
          { status: 400 }
        );
      }
      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
        generatedFiles: [],
      };
      const systemPrompt = generalMode
        ? generalSystemPrompt
        : SYSTEM_PROMPTS.base + "\n\n" + (SYSTEM_PROMPTS.override || "");
      const grokModel = MODEL_GROK_43_XAI_API;
      if (assistantMode || (!useTools && !generalMode)) {
        const conversation = buildConversationMessages(messages);
        const result = await runGrokByokChat({
          apiKey,
          model: grokModel,
          systemPrompt,
          messages: conversation.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        });
        completion = result.text;
        usedModel = result.model;
        toolsUsed = [];
      } else {
        const history = buildConversationMessages(messages)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(0, -1)
          .map((m) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as
              | "user"
              | "assistant",
            content: m.content,
          }));
        const result = await runGrokByokAgent({
          apiKey,
          query: lastUserQuery,
          toolContext,
          systemPrompt,
          model: grokModel,
          useTools: true,
          history,
        });
        completion = result.text;
        toolsUsed = result.toolsUsed;
        usedModel = result.model;
        generatedFiles = toolContext.generatedFiles || [];
        crmMutated = toolsUsed.some((t) => /^(create_|update_|link_)/.test(t));
      }
    }
    // ---------- BYOK OpenAI ----------
    else if (provider === "openai") {
      if (!userId) {
        return NextResponse.json(
          {
            error: "Sign in required to use your OpenAI API key",
            suggestion: "Log in, then save your key under Settings → AI Providers",
          },
          { status: 401 }
        );
      }

      const apiKey = await getDecryptedOpenaiKey(userId);
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "No OpenAI API key saved",
            suggestion:
              "Add your key in Settings → AI Providers, or switch to Platform (Bedrock).",
          },
          { status: 400 }
        );
      }

      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
        generatedFiles: [],
      };

      const systemPrompt =
        SYSTEM_PROMPTS.base + "\n\n" + (SYSTEM_PROMPTS.override || "");

      if (assistantMode || !useTools) {
        console.log("[BYOK] OpenAI chat (no tools)...");
        const conversation = buildConversationMessages(messages);
        const result = await runOpenaiByokChat({
          apiKey,
          model: usedModel,
          systemPrompt,
          messages: conversation.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        });
        completion = result.text;
        usedModel = result.model;
        toolsUsed = [];
      } else {
        console.log("[BYOK] OpenAI agent with tools...");
        const result = await runOpenaiByokAgent({
          apiKey,
          query: lastUserQuery,
          toolContext,
          systemPrompt,
          model: usedModel,
          useTools: true,
        });
        completion = result.text;
        toolsUsed = result.toolsUsed.length
          ? result.toolsUsed
          : ["apollo", "tavily"];
        usedModel = result.model;
        generatedFiles = toolContext.generatedFiles || [];
        if (
          toolsUsed.some((t) => /^(create_|update_|link_)/.test(String(t)))
        ) {
          crmMutated = true;
        }
      }
    }
    // ---------- BYOK Google Gemini ----------
    else if (provider === "gemini") {
      if (!userId) {
        return NextResponse.json(
          {
            error: "Sign in required to use your Gemini API key",
            suggestion: "Log in, then save your key under Settings → AI Providers",
          },
          { status: 401 }
        );
      }

      const apiKey = await getDecryptedGeminiKey(userId);
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "No Gemini API key saved",
            suggestion:
              "Add your key in Settings → AI Providers, or switch to Platform (Bedrock).",
          },
          { status: 400 }
        );
      }

      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
        generatedFiles: [],
      };

      const systemPrompt =
        SYSTEM_PROMPTS.base + "\n\n" + (SYSTEM_PROMPTS.override || "");

      if (assistantMode || !useTools) {
        console.log("[BYOK] Gemini chat (no tools)...");
        const conversation = buildConversationMessages(messages);
        const result = await runGeminiByokChat({
          apiKey,
          model: usedModel,
          systemPrompt,
          messages: conversation.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        });
        completion = result.text;
        usedModel = result.model;
        toolsUsed = [];
      } else {
        console.log("[BYOK] Gemini agent with tools...");
        const result = await runGeminiByokAgent({
          apiKey,
          query: lastUserQuery,
          toolContext,
          systemPrompt,
          model: usedModel,
          useTools: true,
        });
        completion = result.text;
        toolsUsed = result.toolsUsed.length
          ? result.toolsUsed
          : ["apollo", "tavily"];
        usedModel = result.model;
        generatedFiles = toolContext.generatedFiles || [];
        if (
          toolsUsed.some((t) => /^(create_|update_|link_)/.test(String(t)))
        ) {
          crmMutated = true;
        }
      }
    }
    // ---------- Platform: Grok 4.3 on Bedrock Mantle (OpenAI-compatible) ----------
    // Not Converse/Invoke — https://bedrock-mantle.{region}.api.aws/openai/v1
    else if (provider === "bedrock" && isGrokModelId(usedModel)) {
      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
        generatedFiles: [],
      };
      const systemPrompt = generalMode
        ? generalSystemPrompt
        : SYSTEM_PROMPTS.base + "\n\n" + SYSTEM_PROMPTS.override;
      const conversation = buildConversationMessages(messages);
      const history = conversation
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1)
        .map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: typeof m.content === "string" ? m.content : String(m.content),
        }));
      const grokId = MODEL_GROK_43;

      try {
        if (assistantMode || (!useTools && !generalMode)) {
          console.log("[Mantle Grok] chat...", grokId);
          const result = await runMantleGrokChat({
            model: grokId,
            systemPrompt,
            messages: conversation
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                role: (m.role === "assistant" ? "assistant" : "user") as
                  | "user"
                  | "assistant",
                content:
                  typeof m.content === "string" ? m.content : String(m.content),
              })),
          });
          completion = result.text;
          usedModel = result.model;
          toolsUsed = ["mantle-grok-chat"];
        } else {
          console.log(
            generalMode
              ? `[Mantle Grok] General AI agent (${modelLabel})...`
              : "[Mantle Grok] agent with tools..."
          );
          const result = await runMantleGrokAgent({
            query: lastUserQuery,
            toolContext,
            systemPrompt,
            model: grokId,
            useTools: true,
            history,
          });
          completion = result.text;
          usedModel = result.model;
          toolsUsed = result.toolsUsed;
          generatedFiles = toolContext.generatedFiles || [];
          crmMutated = toolsUsed.some((t) =>
            /^(create_|update_|link_)/.test(String(t))
          );
        }
      } catch (mantleErr) {
        // Fall back to Claude Sonnet on classic Bedrock if Mantle fails
        console.warn(
          "[Mantle Grok] failed, falling back to Sonnet:",
          mantleErr instanceof Error ? mantleErr.message : mantleErr
        );
        usedModel = MODEL_SONNET;
        modelLabel = friendlyModelLabel(MODEL_SONNET);
        const toolContextFb: ToolContext = {
          tenantId,
          userId,
          requestUrl: appUrl,
          generatedFiles: [],
        };
        const agentResult = await runMCPAgent(lastUserQuery, toolContextFb, {
          history: conversation.slice(0, -1),
          systemPrompt: generalMode ? generalSystemPrompt : undefined,
          modelId: MODEL_SONNET,
        });
        completion = agentResult.text;
        usedModel = agentResult.modelId;
        toolsUsed = [
          ...agentResult.toolsUsed,
          "fallback:sonnet-after-mantle-error",
        ];
        crmMutated = agentResult.crmMutated;
        generatedFiles = agentResult.generatedFiles || [];
      }
    }
    // ---------- Platform Bedrock: Amazon Nova ----------
    else if (isNovaModel(usedModel)) {
      // Nova uses Converse API (not Anthropic tool_use format)
      console.log("Running Amazon Nova via Converse...");
      const conversation = buildConversationMessages(messages);
      const systemPrompt = generalMode
        ? generalSystemPrompt
        : SYSTEM_PROMPTS.base + "\n\n" + SYSTEM_PROMPTS.override;
      const messagesForModel = conversation
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as
            | "user"
            | "assistant",
          content: typeof m.content === "string" ? m.content : String(m.content),
        }));
      const result = await invokeNovaConverse(
        messagesForModel,
        systemPrompt,
        usedModel
      );
      completion = result.text;
      usedModel = result.modelId;
      toolsUsed = ["nova-converse"];
    } else if (assistantMode && !generalMode) {
      // Claude-only Assistant mode (no external tools, just conversation)
      console.log("Running Claude Assistant mode (no tools)...");
      const conversation = buildConversationMessages(messages);
      const systemPrompt = SYSTEM_PROMPTS.base + "\n\n" + SYSTEM_PROMPTS.override;

      const messagesForModel: ClaudeMessage[] = conversation.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const result = await invokeClaude(messagesForModel, [], systemPrompt, usedModel);
      const textBlock = result.content.find(
        (c): c is ClaudeContent & { type: "text" } =>
          typeof c === "object" && c.type === "text"
      );
      completion = textBlock?.text || "No response";
      usedModel = result.modelId;
      toolsUsed = [];
    } else if ((useTools || generalMode) && lastUserQuery) {
      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
        generatedFiles: [],
      };

      const conversation = buildConversationMessages(messages);
      // Prior turns only (current query is passed separately)
      const history = conversation.slice(0, -1);

      console.log(
        generalMode
          ? `Running General AI agent (${modelLabel} + tools + multi-turn)...`
          : "Running MCP agent with native tool calling..."
      );

      const agentResult = await runMCPAgent(lastUserQuery, toolContext, {
        history,
        systemPrompt: generalMode
          ? generalSystemPrompt
          : undefined,
        modelId: usedModel,
      });
      completion = agentResult.text;
      usedModel = agentResult.modelId;
      crmMutated = !!agentResult.crmMutated;
      generatedFiles = agentResult.generatedFiles || toolContext.generatedFiles || [];
      toolsUsed =
        agentResult.toolsUsed.length > 0
          ? agentResult.toolsUsed
          : useTools || generalMode
            ? ["available:apollo,tavily,internal_data"]
            : [];
      // Ensure UI always knows to refresh when a write tool was invoked
      if (
        !crmMutated &&
        toolsUsed.some((t) =>
          /^(create_|update_|link_)/.test(String(t))
        )
      ) {
        // Tool ran; may still be needs_confirmation — client invalidates only on created
        // crmMutated already false unless status created/updated
      }
    } else {
      // Simple mode - just invoke without tools
      console.log("Running simple model invocation without tools...");
      const conversation = buildConversationMessages(messages);
      const systemPrompt = generalMode
        ? generalSystemPrompt
        : SYSTEM_PROMPTS.base + "\n\n" + SYSTEM_PROMPTS.override;

      const messagesForModel: ClaudeMessage[] = conversation.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const result = await invokeClaude(
        messagesForModel,
        [],
        systemPrompt,
        usedModel
      );
      const textBlock = result.content.find(
        (c): c is ClaudeContent & { type: "text" } =>
          typeof c === "object" && c.type === "text"
      );
      completion = textBlock?.text || "No response";
      usedModel = result.modelId;
    }

// ============================================================================
// Success Response
// ============================================================================
    
    const latencyMs = Date.now() - startTime;
    
    // Estimate tokens (rough calculation)
    const promptTokens = estimateTokens(lastUserQuery) + 500; // Base system prompt overhead
    const completionTokens = estimateTokens(completion);
    const tokens: TokenUsage = {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    };
    
// Estimate cost
    const cost = estimateCost(promptTokens, completionTokens);
    
    // Log success with token usage
    logRequest({
      query: lastUserQuery,
      tenantId,
      toolsUsed,
      latencyMs,
      tokens,
      cost,
    });

    // Log to DynamoDB for dashboard usage tracking (await so failures are visible)
    // General AI Usage appears on /dashboard/usage with a [General AI] prefix
    const previewPrefix = generalMode ? "[General AI] " : "";
    const usageLog = await logBedrockUsage({
      modelId: `${provider}:${usedModel}`,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      queryPreview: (previewPrefix + lastUserQuery).substring(0, 200),
      toolsUsed: generalMode
        ? Array.from(new Set(["general-ai", ...toolsUsed]))
        : toolsUsed,
      latencyMs,
      tenantId,
      userId,
      provider,
    });
    if (!usageLog.ok) {
      console.error('[USAGE] log failed:', usageLog.error);
    }

    const response = NextResponse.json({
      response: completion,
      toolsUsed,
      /** True when a CRM write tool returned status created/updated/linked/stage_updated */
      crmMutated,
      /** Files from generate_file — UI shows Download buttons (base64) */
      generatedFiles: generatedFiles.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        contentBase64: f.contentBase64,
        sizeBytes: f.sizeBytes,
        format: f.format,
      })),
      provider,
      model: usedModel,
      modelLabel: friendlyModelLabel(usedModel),
      autoRouted: !!generalMode,
      usageLogged: usageLog.ok,
      usageTenantId: usageLog.tenantId,
      rateLimit: {
        remaining: rateLimitResult.remaining,
        tenantId: tenantId ? "provided" : "anonymous",
      } as RateLimitInfo,
      tokens,
      cost,
    });
    
    return addRateLimitHeaders(response, rateLimitResult);
    
} catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    try {
      const { error: errMsg, status, suggestion } = handleBedrockError(err);

      // Log error
      logRequest({
        query: lastUserQuery,
        tenantId,
        toolsUsed: [],
        latencyMs,
        error: err instanceof Error ? err.message : "Unknown",
      });

      // Always JSON — clients must never see plain-text platform bodies from our handler
      return NextResponse.json(
        {
          error: errMsg,
          message: errMsg,
          ...(suggestion && { suggestion }),
        },
        {
          status: status || 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    } catch (secondary: unknown) {
      // Last resort: never throw out of the route with a non-JSON body
      console.error("[bedrock] error handler failed:", secondary);
      const fallback =
        err instanceof Error ? err.message : "Unknown AI service error";
      return NextResponse.json(
        {
          error: `Bedrock error: ${fallback}`,
          message: `Bedrock error: ${fallback}`,
          suggestion:
            "Try again in a moment. If this persists, hard-refresh or start a new chat.",
        },
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }
  }
}

// ============================================================================
// Bedrock Client (module-level)
// ============================================================================

const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION || "us-east-1" 
});
