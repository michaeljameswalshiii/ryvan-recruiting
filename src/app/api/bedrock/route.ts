/**
 * Bedrock AI API Route
 * Refactored to use tool registry pattern
 * 
 * Structure:
 * - Tool registry from src/lib/ai/tools/index.ts
 * - Uses extracted system prompts from bedrock-system.ts
 * - Proper error handling with retries
 * - Session-aware with tenant context from middleware headers
 * - Rate limiting for AI calls
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, addRateLimitHeaders } from "@/lib/rate-limit";
import { SYSTEM_PROMPTS } from "@/lib/prompts/bedrock-system";
// NEW: Tool registry pattern - Phase 3 completion
import { selectTools as chooseTools, executeTool, ToolContext } from "@/lib/ai/tools";

// Bedrock client - server-only env var
const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION || "us-east-1" 
});

const DEFAULT_MODEL = "minimax.minimax-m2.5";

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
  // Fallback to IP
  const ip = request.headers.get("x-forwarded-for") || 
    request.headers.get("x-real-ip") || 
    "unknown";
  return `bedrock:ip:${ip.split(",")[0].trim()}`;
}

// ============================================================================
// Tool Registry - Using Imported Tool Registry Pattern
// ============================================================================
// Note: Tool implementations are now in src/lib/ai/tools/index.ts
// We use executeTool() and chooseTools() from the imported registry

// ============================================================================
// Modular System Prompts - Using extracted getSystemPrompt from prompts module
// ============================================================================

// Note: SYSTEM_PROMPTS is now extracted to src/lib/prompts/bedrock-system.ts
// We use getSystemPrompt() function from there instead of inline prompts

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, model = DEFAULT_MODEL, useTools = true } = body;

// ============================================================================
    // Get Tenant Context (from middleware headers injected by middleware)
    // ============================================================================
    // Middleware injects x-tenant-id header - use that
    const tenantId = request.headers.get("x-tenant-id");

    // ============================================================================
    // Rate Limiting
    // ============================================================================
    const rateLimitKey = getRateLimitKey(request, tenantId);
    const rateLimitResult = checkRateLimit(rateLimitKey);
    
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { error: "Rate limit exceeded. Please wait before trying again." },
        { status: 429 }
      );
      return addRateLimitHeaders(response, rateLimitResult);
    }

    // Get request URL for internal API calls
    const requestUrl = request.url ? new URL(request.url).origin : undefined;

    // Get latest user message
    const userMessage = messages
      .filter((m: any) => m.role === "user")
      .slice(-1)[0];

    const lastUserQuery = userMessage?.content || "";

// ============================================================================
    // Tool Execution - Using Tool Registry
    // ============================================================================
    
    // Create tool context for execution
    const toolContext: ToolContext = {
      tenantId,
      userId: null,
      requestUrl,
    };
    
    // Use imported chooseTools to select appropriate tools
    const toolsToUse = chooseTools(lastUserQuery);
    
    // Execute tools using the tool registry
    const toolResultsMap: Record<string, any> = {};
    
    for (const toolName of toolsToUse) {
      // Build input based on tool type
      const input = toolName === "apollo" 
        ? { query: lastUserQuery, per_page: 10 }
        : toolName === "tavily"
          ? { query: lastUserQuery, max_results: 5 }
          : { query: lastUserQuery };
      
      // Execute tool via registry
      const result = await executeTool(toolName, input, toolContext);
      toolResultsMap[toolName] = result;
    }

    // ============================================================================
    // Build Messages for Model
    // ============================================================================
    
    // Filter conversation
    const conversation = messages
      .filter((m: any) => m.role !== "system" && m.id !== "welcome")
      .map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }));

    // Build system prompt
    let systemPrompt = SYSTEM_PROMPTS.base + "\n\n";
    
// Add tool context
    if (toolResultsMap.apollo) {
if (toolResultsMap.apollo.success) {
        systemPrompt += SYSTEM_PROMPTS.apolloAvailable + "\n\n";
      } else {
        systemPrompt += SYSTEM_PROMPTS.apolloUnavailable + "\n";
        systemPrompt += `Error: ${toolResultsMap.apollo.error}\n\n`;
      }
    }
    
    systemPrompt += SYSTEM_PROMPTS.override;

    // Build mmMessages
    const mmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt }
    ];

    for (const msg of conversation) {
      mmMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }

// Add tool results as user messages
    if (toolResultsMap.apollo?.success && (toolResultsMap.apollo.data as any[])?.length > 0) {
const candidates = (toolResultsMap.apollo.data as any[])
        .map((p: any) => `${p.name} - ${p.title} at ${p.organization}\nEmail: ${p.email}\nPhone: ${p.phone}\nLinkedIn: ${p.linkedin_url}`)
        .join("\n\n");
      
      mmMessages.push({
        role: "user",
        content: `Candidate Results:\n${candidates}`
      });
    }

if (toolResultsMap.tavily?.success && (toolResultsMap.tavily.data as any[])?.length > 0) {
const results = (toolResultsMap.tavily.data as any[])
        .map((r: any, i: number) => `${i + 1}. ${r.title}\n${r.snippet}`)
        .join("\n\n");
      
      mmMessages.push({
        role: "user",
        content: `Search Results:\n${results}`
      });
    }

    // ============================================================================
    // Invoke Bedrock
    // ============================================================================
    
    const input = {
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: mmMessages,
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

    const response = NextResponse.json({
      response: completion,
toolsUsed: Object.keys(toolResultsMap),
      toolResults: {
apollo: toolResultsMap.apollo ? {
          success: toolResultsMap.apollo.success,
          error: toolResultsMap.apollo.error,
          count: (toolResultsMap.apollo.data as any[])?.length || 0
        } : undefined,
        tavily: toolResultsMap.tavily ? {
          success: toolResultsMap.tavily.success,
          error: toolResultsMap.tavily.error,
          count: (toolResultsMap.tavily.data as any[])?.length || 0
        } : undefined,
      },
      // Include rate limit info in response
      rateLimit: {
        remaining: rateLimitResult.remaining,
        tenantId: tenantId ? "provided" : "anonymous"
      }
    });
    
    // Add rate limit headers
    return addRateLimitHeaders(response, rateLimitResult);
    
  } catch (err: any) {
    console.error("Bedrock error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
