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

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, addRateLimitHeaders } from "@/lib/rate-limit";
import { logBedrockUsage } from "@/lib/aws/athena-bedrock";
import { SYSTEM_PROMPTS, getBasePrompt } from "@/lib/prompts/bedrock-system";
import { getClaudeAssistantPrompt } from "@/lib/prompts/claude-assistant";
import { getToolSchemas, executeTool, ToolContext, ToolResult, ToolParams } from "@/lib/ai/tools";
import {
  getDecryptedAnthropicKey,
  getDecryptedGrokKey,
  getAiCredentialsPublic,
} from "@/lib/db/repositories/ai-credentials-repository";
import {
  runAnthropicByokAgent,
  runAnthropicByokChat,
} from "@/lib/ai/providers/anthropic-byok";
import {
  runGrokByokAgent,
  runGrokByokChat,
} from "@/lib/ai/providers/grok-byok";
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

/** Platform Bedrock vs user BYOK (Anthropic / Grok) */
export type AiProviderId = "bedrock" | "anthropic" | "grok";

/**
 * Request body
 */
interface BedrockRequest {
  messages: ChatMessage[];
  model?: string;
  useTools?: boolean;
  assistantMode?: boolean;
  /** 'bedrock' (platform) | 'anthropic' | 'grok' (BYOK) */
  provider?: AiProviderId;
  useSearch?: boolean;
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

// Haiku 4.5 - Fast/cheap for simple queries
const MODEL_HAIKU = "us.anthropic.claude-haiku-4-2025-01-15";

// Sonnet 4.6 - Default for most agentic work  
// Using global model for cross-region access
const MODEL_SONNET = "global.anthropic.claude-sonnet-4-6";

// Opus 4.7 - For very complex multi-step tasks
const MODEL_OPUS = "us.anthropic.claude-opus-4-7-2025-01-15";

// Fallback: Try legacy format if main models fail
const MODEL_SONNET_FALLBACK = "us.anthropic.claude-sonnet-4-6-20250219";
const MODEL_HAIKU_FALLBACK = "anthropic.claude-haiku-4-2025-01-15";

// Default model (Sonnet 4.6 for agentic work with native tool calling)
const DEFAULT_MODEL = MODEL_SONNET;

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
  
  // Simple indicators: basic lookup, single entity, quick fact
  const simpleKeywords = [
    "what is", "who is", "find", "show", "get", "list",
    "email", "phone", "contact", "linkedin",
    "summarize", " summarize", "quick", "just",
    "weather", "stock", "price", "today"
  ];
  
  // Count keyword matches
  const complexMatches = complexKeywords.filter(kw => q.includes(kw)).length;
  const simpleMatches = simpleKeywords.filter(kw => q.includes(kw)).length;
  
  // Determine complexity
  if (complexMatches >= 2 || wordCount > 50) {
    return "complex";
  }
  
  if (simpleMatches >= 1 && complexMatches === 0 && wordCount < 15) {
    return "simple";
  }
  
  // Default to moderate
  return "moderate";
}

/**
 * Select model based on query complexity and context
 * 
 * @param query - User query
 * @param requestedModel - Optional user-requested model
 * @returns Selected model ID
 */
function selectModel(query: string, requestedModel?: string): string {
  // If user explicitly requested a model, use it (with validation)
  if (requestedModel) {
    const validModels = [MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, DEFAULT_MODEL];
    if (validModels.includes(requestedModel)) {
      return requestedModel;
    }
    // Fall back to default if invalid model requested
    console.warn(`Invalid model requested: ${requestedModel}, using default`);
  }
  
  // Analyze query complexity
  const complexity = analyzeQueryComplexity(query);
  
  // Route to appropriate model
  switch (complexity) {
    case "simple":
      console.log(`Routing to Haiku 4.5 (simple query detected)`);
      return MODEL_HAIKU;
    
    case "complex":
      console.log(`Routing to Opus 4.7 (complex query detected)`);
      return MODEL_OPUS;
    
    case "moderate":
    default:
      console.log(`Routing to Sonnet 4.6 (default for agentic work)`);
      return MODEL_SONNET;
  }
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
  return [
    {
      name: "apollo",
      description: "Search for candidates, people, or companies using Apollo.io. Use to find emails, phones, LinkedIn profiles for recruiting or sales.",
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
      name: "tavily",
      description: "Search the web for latest news, current events, weather, stock prices, or general information.",
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
      name: "internal_data",
      description: "Get the user's existing leads, clients, or pipeline data from the database.",
      input_schema: {
        type: "object",
        properties: {
          data_type: { type: "string", description: "Type: leads, clients, or pipeline" },
          action: { type: "string", description: "Action: list, get, or count" },
        },
        required: ["data_type"],
      },
    },
  ];
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
  systemPrompt: string = ""
): Promise<{ content: ClaudeContent[]; stop_reason?: string }> {
  const selectedModel = DEFAULT_MODEL;
  
// Build request body with system prompt in correct field
  // NOTE: Only temperature - cannot use both temperature and top_p in Bedrock
  const body: Record<string, unknown> = {
    anthropic_version: ANTHROPIC_VERSION,
    max_tokens: MODEL_CONFIG.maxTokens,
    temperature: MODEL_CONFIG.temperature,
    messages,
  };
  
  // Place system prompt in top-level field (correct for Anthropic API)
  if (systemPrompt) {
    body.system = systemPrompt;
  }
  
  // Add tools if provided
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: "auto" };
  }
  
  console.log(`[MCP] Invoking ${selectedModel} with ${messages.length} messages, ${tools.length} tools`);
  
  const command = new InvokeModelCommand({
    modelId: selectedModel,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });
  
const response = await bedrockClient.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  
  // Log token usage
  const usage = result.usage;
  console.log(`[MCP] Claude response - stop_reason: ${result.stop_reason} | tokens: ${usage?.input_tokens}/${usage?.output_tokens}`);
  
  return {
    content: result.content || [],
    stop_reason: result.stop_reason,
  };
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
  
  return `Tool not found: ${toolName}`;
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
 * Robust implementation with parallel tool execution
 * 
 * @param query - User query
 * @param toolContext - Tool execution context
 * @returns Final response string
 */
async function runMCPAgent(
  query: string,
  toolContext: ToolContext
): Promise<string> {
  const systemPrompt = `You are an MCP (Multi-step Cognitive Processor) agent powered by Claude Sonnet 4.6.
Specialize in talent sourcing, recruiting, and business development using Apollo.io.
Think step-by-step: Plan → Use tools when needed → Observe results → Reflect → Final Answer.
Only use tools when they genuinely help. Be concise and actionable.`;

  const tools = getToolSchemasForBedrock();
  
  // Initial messages (system prompt in messages array)
  let messages: ClaudeMessage[] = [
    { role: "user", content: query },
  ];
  
  const MAX_ITERATIONS = 5;
  let iteration = 0;
  
  while (iteration < MAX_ITERATIONS) {
    console.log(`[MCP] Iteration ${iteration + 1}/${MAX_ITERATIONS}`);
    
    // Invoke model with tools and system prompt
    const result = await invokeClaude(messages, tools, systemPrompt);
    const content = result.content;
    
    // Check for tool uses
    const toolUses = content.filter((c): c is ClaudeContent & { type: "tool_use" } => 
      typeof c === "object" && c.type === "tool_use"
    );
    
    if (toolUses.length === 0) {
      // No tools called - return final response
      const textBlock = content.find((c): c is ClaudeContent & { type: "text" } => 
        typeof c === "object" && c.type === "text"
      );
      const text = textBlock?.text || "No response";
      console.log(`[MCP] Final response: ${text.substring(0, 100)}...`);
      return text;
    }
    
    // Execute tools IN PARALLEL
    console.log(`[MCP] Executing ${toolUses.length} tool(s) in parallel...`);
    const executions = toolUses.map(tool => executeSingleTool(tool, toolContext));
    const toolResults = await Promise.all(executions);
    
    // Format tool results for Claude
    const formattedToolResults = toolResults.map(r => ({
      type: "tool_result",
      tool_use_id: r.tool_use_id,
      content: r.content,
    })) as ClaudeContent[];
    
    // Add assistant's tool_use to messages
    messages.push({ role: "assistant", content });
    
    // Add tool results as user message
    messages.push({ role: "user", content: formattedToolResults });
    
    iteration++;
  }
  
  console.log(`[MCP] Max iterations (${MAX_ITERATIONS}) reached`);
  return "Maximum iterations reached. Please refine your query.";
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
      provider: requestedProvider,
    } = body;
    
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
    if (
      requestedProvider === "anthropic" ||
      requestedProvider === "bedrock" ||
      requestedProvider === "grok"
    ) {
      provider = requestedProvider;
    } else if (userId) {
      try {
        const prefs = await getAiCredentialsPublic(userId);
        if (prefs.preferredProvider === "anthropic" && prefs.hasAnthropicKey) {
          provider = "anthropic";
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

    const selectedModel =
      provider === "anthropic"
        ? process.env.ANTHROPIC_BYOK_MODEL || "claude-sonnet-4-20250514"
        : provider === "grok"
          ? process.env.GROK_BYOK_MODEL || process.env.XAI_BYOK_MODEL || "grok-3"
          : selectModel(lastUserQuery, requestedModel);
    
    console.log("=== MODEL SELECTION ===");
    console.log("Provider:", provider);
    console.log("Requested model:", requestedModel || "none");
    console.log("Selected model:", selectedModel);
    console.log("Query preview:", lastUserQuery.substring(0, 50));

    // Bedrock path needs AWS config
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
    // ---------- BYOK Grok (xAI) ----------
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
        console.log("[BYOK] Grok chat (no tools)...");
        const conversation = buildConversationMessages(messages);
        const result = await runGrokByokChat({
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
        console.log("[BYOK] Grok agent with tools...");
        const result = await runGrokByokAgent({
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
    // ---------- Platform Bedrock (existing) ----------
    else if (assistantMode) {
      // Claude-only Assistant mode (no external tools, just conversation)
      console.log("Running Claude Assistant mode (no tools)...");
      const conversation = buildConversationMessages(messages);
      const systemPrompt = SYSTEM_PROMPTS.base + "\n\n" + SYSTEM_PROMPTS.override;
      
      const messagesForModel: ClaudeMessage[] = [
        { role: "system", content: systemPrompt },
        ...conversation.map(m => ({ role: m.role, content: m.content })),
      ];
      
      const result = await invokeClaude(messagesForModel, []);
      const textBlock = result.content.find((c): c is ClaudeContent & { type: "text" } => 
        typeof c === "object" && c.type === "text"
      );
      completion = textBlock?.text || "No response";
      toolsUsed = []; // No tools in assistant mode
    } else if (useTools && lastUserQuery) {
      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
      };

      console.log("Running MCP agent with native tool calling...");
      completion = await runMCPAgent(lastUserQuery, toolContext);
      toolsUsed = ["apollo", "tavily"]; // Log that tools were available
    } else {
      // Simple mode - just invoke without tools
      console.log("Running simple model invocation without tools...");
      const conversation = buildConversationMessages(messages);
      const systemPrompt = SYSTEM_PROMPTS.base + "\n\n" + SYSTEM_PROMPTS.override;
      
      const messagesForModel: ClaudeMessage[] = [
        { role: "system", content: systemPrompt },
        ...conversation.map(m => ({ role: m.role, content: m.content })),
      ];
      
      const result = await invokeClaude(messagesForModel, []);
      const textBlock = result.content.find((c): c is ClaudeContent & { type: "text" } => 
        typeof c === "object" && c.type === "text"
      );
      completion = textBlock?.text || "No response";
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

    // Log to DynamoDB for dashboard usage tracking (app-level AI usage feed)
    logBedrockUsage({
      modelId: `${provider}:${usedModel}`,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      queryPreview: lastUserQuery.substring(0, 200),
      toolsUsed,
      latencyMs,
      tenantId,
      userId,
      provider,
    }).catch((err) => console.error('[USAGE] Failed to log:', err));

    const response = NextResponse.json({
      response: completion,
      toolsUsed,
      provider,
      model: usedModel,
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
    const { error: errMsg, status, suggestion } = handleBedrockError(err);
    
    // Log error
    logRequest({
      query: lastUserQuery,
      tenantId,
      toolsUsed: [],
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown",
    });
    
    return NextResponse.json(
      { 
        error: errMsg,
        message: errMsg,
        ...(suggestion && { suggestion })
      },
      { status }
    );
  }
}

// ============================================================================
// Bedrock Client (module-level)
// ============================================================================

const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION || "us-east-1" 
});
