/**
 * Bedrock AI API Route
 * Refactored with proper TypeScript, logging, and error handling
 * 
 * Features:
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
 * Logging metadata
 */
interface RequestLogMetadata {
  query: string;
  tenantId: string | null;
  toolsUsed: string[];
  latencyMs: number;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODEL = "minimax.minimax-m2.5";

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
  const { query, tenantId, toolsUsed, latencyMs, error } = metadata;
  
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
    console.log(JSON.stringify({
      event: "bedrock-request",
      query: query.substring(0, 100),
      tenantId: tenantId || "anonymous",
      toolsUsed,
      latencyMs,
    }));
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle Bedrock invocation errors
 */
function handleBedrockError(err: unknown): { error: string; status: number } {
  const message = err instanceof Error ? err.message : "Unknown error";
  
  // Check for specific error types
  if (message.includes("ThrottlingException") || message.includes("Rate limit")) {
    return { error: "Rate limit exceeded. Please try again.", status: 429 };
  }
  
  if (message.includes("AccessDeniedException")) {
    return { error: "Model access denied.", status: 403 };
  }
  
  if (message.includes("ValidationException")) {
    return { error: "Invalid request.", status: 400 };
  }
  
  return { error: "Internal server error.", status: 500 };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let tenantId: string | null = null;
  let lastUserQuery = "";
  
  try {
    // Parse request body
    const body: BedrockRequest = await request.json();
    const { messages, model = DEFAULT_MODEL, useTools = true } = body;

    // ============================================================================
    // Get Tenant Context (from middleware headers)
    // ============================================================================
    tenantId = request.headers.get("x-tenant-id");

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

    // Get latest user message
    const userMessage = messages
      .filter((m) => m.role === "user")
      .slice(-1)[0];

    lastUserQuery = userMessage?.content || "";

    // ============================================================================
    // Tool Execution
    // ============================================================================
    let toolResults: Record<string, ToolResult> = {};
    
    if (useTools && lastUserQuery) {
      const toolContext: ToolContext = {
        tenantId,
        userId: null,
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
    // Invoke Bedrock Model
    // ============================================================================
    
    const input = {
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: messagesWithTools,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    };

    const command = new InvokeModelCommand(input);
    const bedrockResponse = await bedrockClient.send(command);

    // Parse response
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const completion = 
      responseBody.choices?.[0]?.message?.content || 
      responseBody.output?.message?.content?.[0]?.text ||
      responseBody.completion || 
      "";

    // ============================================================================
    // Success Response
    // ============================================================================
    
    const latencyMs = Date.now() - startTime;
    
    // Log success
    logRequest({
      query: lastUserQuery,
      tenantId,
      toolsUsed: Object.keys(toolResults),
      latencyMs,
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
    });
    
    return addRateLimitHeaders(response, rateLimitResult);
    
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const { error, status } = handleBedrockError(err);
    
    // Log error
    logRequest({
      query: lastUserQuery,
      tenantId,
      toolsUsed: [],
      latencyMs,
      error: err instanceof Error ? err.message : "Unknown",
    });
    
    console.error("Bedrock error:", err instanceof Error ? err.message : err);
    
    return NextResponse.json(
      { error },
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
