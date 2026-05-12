/**
 * Bedrock AI API Route
 * Refactored with Dynamic Model Routing + MCP-Style Integration
 * 
 * Features:
 * - Dynamic Model Routing:
 *   - Haiku 4.5 for simple queries (fast/cheap)
 *   - Sonnet 4.6 as default for most agentic work
 *   - Opus 4.7 for very complex multi-step tasks
 * - MCP-Style Integration:
 *   - Clear planning step: identify needed tools before execution
 *   - Self-reflection: check if results are sufficient
 *   - Targeted results: go after specific outcomes
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
import { SYSTEM_PROMPTS } from "@/lib/prompts/bedrock-system";
import { selectTools as chooseTools, executeTool, ToolContext, ToolResult } from "@/lib/ai/tools";

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

/**
 * Request body
 */
interface BedrockRequest {
  messages: ChatMessage[];
  model?: string;
  useTools?: boolean;
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
const MODEL_SONNET = "us.anthropic.claude-sonnet-4-6-20250219";

// Opus 4.7 - For very complex multi-step tasks
const MODEL_OPUS = "us.anthropic.claude-opus-4-7-2025-01-15";

// Fallback: Try legacy format if main models fail
const MODEL_SONNET_FALLBACK = "anthropic.claude-sonnet-4-6-20250219";
const MODEL_HAIKU_FALLBACK = "anthropic.claude-haiku-4-2025-01-15";

// Default model (Sonnet 4.6 for agentic work)
const DEFAULT_MODEL = MODEL_SONNET;

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
 * Estimate cost for MiniMax model (USD)
 * Pricing: ~$0.001/1K tokens input, ~$0.002/1K tokens output (approximate)
 */
function estimateCost(promptTokens: number, completionTokens: number): CostEstimate {
  const promptCost = (promptTokens / 1000) * 0.001;
  const completionCost = (completionTokens / 1000) * 0.002;
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
// Tool Execution
// ============================================================================

/**
 * Execute tools based on query
 * Returns map of tool name to result
 */
async function executeToolsForQuery(
  query: string,
  toolContext: ToolContext
): Promise<Record<string, ToolResult>> {
  const toolsToUse = chooseTools(query);
  const results: Record<string, ToolResult> = {};
  
  for (const toolName of toolsToUse) {
    // Build input based on tool type
    const input = toolName === "apollo" 
      ? { query, per_page: 10 }
      : toolName === "tavily"
        ? { query, max_results: 5 }
        : { query };
    
    const result = await executeTool(toolName, input, toolContext);
    results[toolName] = result;
  }
  
  return results;
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
    // EARLY ENVIRONMENT VARIABLE VALIDATION
    // ============================================================================
    const awsRegion = process.env.AWS_REGION;
    const bedrockEndpoint = process.env.AWS_BEDROCK_ENDPOINT;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    console.log("=== BEDROCK REQUEST START ===");
    console.log("AWS_REGION present:", !!awsRegion, awsRegion || "not set");
    console.log("AWS_ACCESS_KEY_ID present:", !!awsAccessKeyId);
    console.log("AWS_SECRET_ACCESS_KEY present:", !!awsSecretAccessKey);
    console.log("AWS_BEDROCK_ENDPOINT present:", !!bedrockEndpoint);
    console.log("NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL || "not set");
    
    if (!awsRegion) {
      console.error("AWS_REGION not configured");
      return NextResponse.json(
        { error: "Server configuration error: AWS_REGION not set" },
        { status: 500 }
      );
    }
    
    // Check for AWS credentials (warn if missing)
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      console.warn("WARNING: AWS credentials may not be configured properly");
    }

    // ============================================================================
    // REQUEST VALIDATION
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
    
    const { messages, model: requestedModel, useTools = true } = body;
    
// Validate messages exist
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required and cannot be empty" },
        { status: 400 }
      );
    }

    // ============================================================================
    // Dynamic Model Routing (MCP-Style)
    // ============================================================================
    // Get the latest user message for routing decision
    const userMessage = messages
      .filter((m) => m.role === "user")
      .slice(-1)[0];

    lastUserQuery = userMessage?.content || "";

// Select model based on query complexity and user request
    const selectedModel = selectModel(lastUserQuery, requestedModel);
    
    // Log detailed model selection info
    console.log("=== MODEL SELECTION ===");
    console.log("Requested model:", requestedModel || "none");
    console.log("Selected model:", selectedModel);
    console.log("Query length:", lastUserQuery.length);
    console.log("Query preview:", lastUserQuery.substring(0, 50));

    // ============================================================================
    // Get Tenant Context (from middleware headers)
    // ============================================================================
    tenantId = request.headers.get("x-tenant-id");
    console.log("Tenant ID:", tenantId || "none provided");
    console.log("User ID:", request.headers.get("x-user-id") || "none");

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
    // Tool Execution
    // ============================================================================
    let toolResults: Record<string, ToolResult> = {};
    
if (useTools && lastUserQuery) {
      // Get userId from session (via middleware header)
      const userId = request.headers.get("x-user-id");
      
      const toolContext: ToolContext = {
        tenantId,
        userId,
        requestUrl: appUrl,
      };
      
      toolResults = await executeToolsForQuery(lastUserQuery, toolContext);
    }

    // ============================================================================
    // Build Messages for Model
    // ============================================================================
    
    // Filter conversation
    const conversation = buildConversationMessages(messages);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(toolResults);

    // Build messages for model
    const mmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add conversation messages
    for (const msg of conversation) {
      mmMessages.push({ role: msg.role, content: msg.content });
    }

    // Add tool results
    const messagesWithTools = addToolResultsToMessages(mmMessages, toolResults);

// ============================================================================
    // Invoke Bedrock Model with Fallback + Timeout
    // ============================================================================
    
    // Timeout settings (30 seconds for each model attempt)
    const MODEL_TIMEOUT_MS = 30000;
    
    // Determine models to try in order: primary, then Haiku fallback, then legacy format
    const modelsToTry = [selectedModel];
    
    // Add fallback models if primary isn't Haiku
    if (selectedModel === MODEL_SONNET || selectedModel === MODEL_OPUS) {
      modelsToTry.push(MODEL_HAIKU);  // Fall back to Haiku
    } else if (selectedModel === MODEL_SONNET_FALLBACK) {
      modelsToTry.push(MODEL_HAIKU_FALLBACK);
    }
    
    // Add legacy format as final fallback
    if (selectedModel.startsWith("us.")) {
      modelsToTry.push(selectedModel.replace("us.", ""));
    }
    
    let completion = "";
    let finalModelUsed = "";
    let invokeError: unknown = null;
    
    for (const modelId of modelsToTry) {
      try {
        console.log(`Trying model: ${modelId} with ${MODEL_TIMEOUT_MS}ms timeout`);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error(`Model ${modelId} timed out after ${MODEL_TIMEOUT_MS}ms`);
          controller.abort();
        }, MODEL_TIMEOUT_MS);
        
        const input = {
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            messages: messagesWithTools,
            max_tokens: 4096,
            temperature: 0.7,
          }),
        };

        const command = new InvokeModelCommand(input);
        
        // Use signal for timeout (AWS SDK v3 supports AbortSignal)
        const bedrockResponse = await bedrockClient.send(command, {
          abortSignal: controller.signal as AbortSignal
        });
        
        clearTimeout(timeoutId);

        // Parse response
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
        completion = 
          responseBody.choices?.[0]?.message?.content || 
          responseBody.output?.message?.content?.[0]?.text ||
          responseBody.completion || 
          "";
        
        finalModelUsed = modelId;
        console.log(`Successfully invoked model: ${modelId}`);
        break; // Success - exit loop
        
      } catch (err) {
        console.error(`Model ${modelId} failed:`, err instanceof Error ? err.message : "Unknown error");
        invokeError = err;
        // Continue to next model in fallback list
      }
    }
    
    // If all models failed, throw the last error
    if (!completion && invokeError) {
      throw invokeError;
    }

// ============================================================================
    // Success Response
    // ============================================================================
    
    const latencyMs = Date.now() - startTime;
    
    // Extract text from messages for token estimation
    const promptText = messagesWithTools.map(m => m.content).join(" ");
    const promptTokens = estimateTokens(promptText);
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
      toolsUsed: Object.keys(toolResults),
      latencyMs,
      tokens,
      cost,
    });

    // Build tool result summaries
    const toolResultSummaries: Record<string, ToolResultSummary> = {};
    
    if (toolResults.apollo) {
      const r = toolResults.apollo;
      const data = r.data as ToolResultData;
      toolResultSummaries.apollo = {
        success: r.success,
        error: r.error,
        count: data.candidates?.length || 0,
      };
    }
    
    if (toolResults.tavily) {
      const r = toolResults.tavily;
      const data = r.data as ToolResultData;
      toolResultSummaries.tavily = {
        success: r.success,
        error: r.error,
        count: data.results?.length || 0,
      };
    }

const response = NextResponse.json({
      response: completion,
      toolsUsed: Object.keys(toolResults),
      toolResults: toolResultSummaries,
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
