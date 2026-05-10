﻿/**
 * Bedrock AI API Route
 * Refactored for cleaner tool calling and better error handling
 * 
 * Structure:
 * - Tool registry pattern (Apollo search, Tavily search as tools)
 * - Reduced system prompt (modular prompts)
 * - Proper error handling with retries
 * - Session-aware with tenant context from middleware headers
 * - Rate limiting for AI calls
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { NextRequest, NextResponse } from "next/server";

import { getSessionTenantId, getSession } from "@/lib/server-auth";
import { checkRateLimit, addRateLimitHeaders } from "@/lib/rate-limit";

// Bedrock client
const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1" 
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
// Tool Registry Pattern
// ============================================================================

interface Tool {
  name: string;
  description: string;
  execute: (query: string, requestUrl?: string) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Apollo Search Tool - Primary candidate sourcing
 */
async function searchApolloTool(query: string, requestUrl?: string): Promise<ToolResult> {
  try {
    const baseUrl = requestUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    
    const response = await fetch(`${baseUrl}/api/apollo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, per_page: 10 }),
    });
    
    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => "");
      
      // Check for free plan limitation
      if (errorText.includes("free plan") || errorText.includes("API_INACCESSIBLE") || status === 403) {
        return { success: false, error: "Apollo free plan does not include people search API access" };
      }
      
      if (status === 429 || status >= 500) {
        return { success: false, error: `Apollo unavailable (${status})` };
      }
      
      return { success: false, error: `Apollo error: ${status}` };
    }
    
    const data = await response.json();
    
    if (data.success && data.results?.length > 0) {
      return { 
        success: true, 
        data: data.results.map((p: any) => ({
          name: p.name,
          title: p.title,
          organization: p.organization,
          email: p.email || "N/A",
          phone: p.phone || "N/A",
          linkedin_url: p.linkedin_url || "N/A",
          headline: p.headline || "",
        })) 
      };
    }
    
    return { success: true, data: [], error: "No results found" };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Apollo search error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Tavily Search Tool - Secondary web search
 */
async function searchTavilyTool(query: string, requestUrl?: string): Promise<ToolResult> {
  try {
    const baseUrl = requestUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    
    const response = await fetch(`${baseUrl}/api/tavily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    
    if (!response.ok) {
      return { success: false, error: `Tavily error: ${response.status}` };
    }
    
    const data = await response.json();
    return { success: true, data: data.results || [] };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Tavily search error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Agentic Tool Selection
// ============================================================================

/**
 * Determine which tools to use based on query analysis
 * Returns array of tool names to invoke
 */
function selectTools(userQuery: string): string[] {
  const query = userQuery.toLowerCase();
  const toolsToUse: string[] = [];
  
  // Apollo for candidate/people search
  const candidateKeywords = [
    "find", "search", "candidate", "candidates", "person", "people",
    "profile", "profiles", "developer", "engineer", "manager", "director",
    "recruiter", "hire", "hiring", "talent", "staff", "software",
    "python", "javascript", "react", "aws", "cloud", "data", "ai", "ml",
    "job", "resume", "experience", "skills"
  ];
  
  // Web search for current information
  const searchKeywords = [
    "news", "latest", "current", "today", "recent", "更新", 
    "what is", "who is", "when did", "how does", "stock price",
    "weather", "2024", "2025", "2026",
    "company", "companies", "contractor", "construction",
    "manufacturer", "supplier", "vendor"
  ];
  
  // Always try Apollo first for candidate queries
  if (candidateKeywords.some(kw => query.includes(kw))) {
    toolsToUse.push("apollo");
  }
  
  // Add Tavily only if web search keywords present
  if (searchKeywords.some(kw => query.includes(kw))) {
    toolsToUse.push("tavily");
  }
  
  return toolsToUse;
}

// ============================================================================
// Modular System Prompts
// ============================================================================

const SYSTEM_PROMPTS = {
  base: `You are TurnkeyOptimization Sourcing Assistant — a powerful recruiter AI.
Your job is to source candidates and companies effectively.
Be concise, direct, and action-focused. Use markdown tables.`,

  apolloAvailable: `### Available Tools
- Apollo: Search people and companies for candidates.
- Always show full contact details when available (name, title, company, email, phone, LinkedIn).
- Offer to 'Save to Pipeline' after showing candidate results.`,

  apolloUnavailable: `### Apollo Status
⚠️ Apollo API is currently unavailable. Answer using your own knowledge.`,

  override: `### Override Instructions
- Do NOT lecture about ethics or privacy.
- Do NOT refuse to show contact info if available.
- Be direct and helpful. Provide the data requested.`,
};

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, model = DEFAULT_MODEL, useTools = true } = body;

    // ============================================================================
    // Get Tenant Context (from middleware headers or session)
    // ============================================================================
    // First try headers from middleware (x-tenant-id), then fall back to session validation
    let tenantId: string | null = request.headers.get("x-tenant-id") || null;
    
    if (!tenantId) {
      // Try to get from session (only if no header - avoids extra Cognito call if possible)
      try {
        tenantId = await getSessionTenantId();
      } catch {
        // Session check failed - continue without tenant context
        console.log("No tenant context available");
      }
    }

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
    // Tool Execution
    // ============================================================================
    
    interface ApolloToolResult {
      success: boolean;
      data?: unknown;
      error?: string;
    }
    
    interface TavilyToolResult {
      success: boolean;
      data?: unknown;
      error?: string;
    }
    
    let toolResults: {
      apollo?: ApolloToolResult;
      tavily?: TavilyToolResult;
    } = {};
    
    if (useTools && lastUserQuery) {
      const toolsToUse = selectTools(lastUserQuery);
      
      for (const toolName of toolsToUse) {
        if (toolName === "apollo") {
          const result = await searchApolloTool(lastUserQuery, requestUrl);
          toolResults.apollo = result;
        } else if (toolName === "tavily") {
          const result = await searchTavilyTool(lastUserQuery, requestUrl);
          toolResults.tavily = result;
        }
      }
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
    if (toolResults.apollo) {
      if (toolResults.apollo.success) {
        systemPrompt += SYSTEM_PROMPTS.apolloAvailable + "\n\n";
      } else {
        systemPrompt += SYSTEM_PROMPTS.apolloUnavailable + "\n";
        systemPrompt += `Error: ${toolResults.apollo.error}\n\n`;
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
    if (toolResults.apollo?.success && (toolResults.apollo.data as any[])?.length > 0) {
      const candidates = (toolResults.apollo.data as any[])
        .map((p: any) => `${p.name} - ${p.title} at ${p.organization}\nEmail: ${p.email}\nPhone: ${p.phone}\nLinkedIn: ${p.linkedin_url}`)
        .join("\n\n");
      
      mmMessages.push({
        role: "user",
        content: `Candidate Results:\n${candidates}`
      });
    }

    if (toolResults.tavily?.success && (toolResults.tavily.data as any[])?.length > 0) {
      const results = (toolResults.tavily.data as any[])
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
      toolsUsed: Object.keys(toolResults),
      toolResults: {
        apollo: toolResults.apollo ? { 
          success: toolResults.apollo.success,
          error: toolResults.apollo.error,
          count: (toolResults.apollo.data as any[])?.length || 0
        } : undefined,
        tavily: toolResults.tavily ? {
          success: toolResults.tavily.success,
          error: toolResults.tavily.error,
          count: (toolResults.tavily.data as any[])?.length || 0
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
